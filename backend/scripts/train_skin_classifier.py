"""Trains the skin classifier via transfer learning on HAM10000.

Run this ONCE, standalone (not part of the live app):
    python scripts/train_skin_classifier.py

Scoped for feasible CPU training time, not maximum accuracy:
- A subset of the dataset, not all ~10,000 images
- Low resolution (128x128)
- Only the final layer of a pretrained ResNet18 is fine-tuned (the rest
  stays frozen, using what it already learned from ImageNet)
- Few epochs

This is a deliberate, documented tradeoff — the honest alternative to
either not building this at all, or claiming a stronger model than what
CPU time here actually allows. Retraining with a larger subset/more
epochs later, given more compute, is a straightforward re-run of this
same script with the constants below changed.

Output: ml_models/skin_classifier.pth (weights) and
ml_models/class_labels.json (index -> class name mapping), used by
app/services/skin_classifier.py at inference time.
"""
import json
import time
from pathlib import Path

import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader, random_split
from torchvision import models, transforms
from datasets import load_dataset

# ── Scope knobs — the honest tradeoff lives here ──────────────────
SUBSET_SIZE = 2000       # out of ~10,000 total images
IMAGE_SIZE = 128
BATCH_SIZE = 32
EPOCHS = 5
LEARNING_RATE = 1e-3
# ────────────────────────────────────────────────────────────────

OUTPUT_DIR = Path(__file__).parent.parent / "ml_models"
OUTPUT_DIR.mkdir(exist_ok=True)

# HAM10000's 7 diagnostic categories. mel/bcc/akiec are the ones worth
# flagging as "see a doctor" — see skin_classifier.py for how this maps
# to the actual flag shown to the patient.
CLASS_NAMES = ["akiec", "bcc", "bkl", "df", "mel", "nv", "vasc"]

DX_KEYWORDS = {
    "akiec": "actinic",
    "bcc": "basal_cell",
    "bkl": "benign_keratosis",
    "df": "dermatofibroma",
    "mel": "melanoma",
    "nv": "nevi",
    "vasc": "vascular",
}

def normalize_dx(dx: str) -> str:
    d = dx.lower().replace("-", "_").replace(" ", "_")
    for code, keyword in DX_KEYWORDS.items():
        if keyword in d and not (code == "mel" and "nevi" in d):
            return code
    raise ValueError(f"Unrecognized dx label: {dx!r}")


class HAM10000Dataset(Dataset):
    def __init__(self, hf_dataset, transform):
        self.data = hf_dataset
        self.transform = transform
        self.label_to_idx = {name: i for i, name in enumerate(CLASS_NAMES)}

    def __len__(self):
        return len(self.data)

    def __getitem__(self, idx):
        row = self.data[idx]
        image = row["image"].convert("RGB")
        label = self.label_to_idx[normalize_dx(row["dx"])]
        return self.transform(image), label


def main():
    print(f"Loading HAM10000 (subset of {SUBSET_SIZE} images)...")
    # marmal88/skin_cancer mirrors HAM10000 with a 'dx' diagnosis column
    # and 'image' column — no login required, public dataset.
    raw_stream = load_dataset("marmal88/skin_cancer", split="train", streaming=True)
    raw = []
    for i, example in enumerate(raw_stream):
        if len(raw) >= SUBSET_SIZE:
            break
        raw.append(example)
        if (i + 1) % 200 == 0:
            print(f"  ...streamed {len(raw)}/{SUBSET_SIZE} images")

    transform = transforms.Compose([
        transforms.Resize((IMAGE_SIZE, IMAGE_SIZE)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])

    dataset = HAM10000Dataset(raw, transform)
    val_size = max(int(0.15 * len(dataset)), 1)
    train_size = len(dataset) - val_size
    train_ds, val_ds = random_split(dataset, [train_size, val_size])

    train_loader = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=BATCH_SIZE)

    print(f"Train: {train_size} images, Val: {val_size} images")

    # Transfer learning: pretrained ResNet18, freeze everything except
    # the final classification layer.
    model = models.resnet18(weights=models.ResNet18_Weights.DEFAULT)
    for param in model.parameters():
        param.requires_grad = False
    model.fc = nn.Linear(model.fc.in_features, len(CLASS_NAMES))

    device = torch.device("cpu")
    model = model.to(device)

    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.Adam(model.fc.parameters(), lr=LEARNING_RATE)

    for epoch in range(EPOCHS):
        start = time.time()
        model.train()
        total_loss, correct, total = 0.0, 0, 0

        for images, labels in train_loader:
            images, labels = images.to(device), labels.to(device)
            optimizer.zero_grad()
            outputs = model(images)
            loss = criterion(outputs, labels)
            loss.backward()
            optimizer.step()

            total_loss += loss.item() * images.size(0)
            correct += (outputs.argmax(1) == labels).sum().item()
            total += labels.size(0)

        train_acc = correct / total
        train_loss = total_loss / total

        model.eval()
        val_correct, val_total = 0, 0
        with torch.no_grad():
            for images, labels in val_loader:
                images, labels = images.to(device), labels.to(device)
                outputs = model(images)
                val_correct += (outputs.argmax(1) == labels).sum().item()
                val_total += labels.size(0)
        val_acc = val_correct / val_total

        elapsed = time.time() - start
        print(
            f"Epoch {epoch+1}/{EPOCHS} — "
            f"train_loss: {train_loss:.4f}, train_acc: {train_acc:.3f}, "
            f"val_acc: {val_acc:.3f} ({elapsed:.0f}s)"
        )

    weights_path = OUTPUT_DIR / "skin_classifier.pth"
    labels_path = OUTPUT_DIR / "class_labels.json"
    torch.save(model.state_dict(), weights_path)
    labels_path.write_text(json.dumps(CLASS_NAMES))

    print(f"\nSaved model to {weights_path}")
    print(f"Saved class labels to {labels_path}")
    print(f"\nFinal validation accuracy: {val_acc:.1%}")
    print(
        "\nNote: this was trained on a subset with a frozen backbone for "
        "feasible CPU training time — a real-world deployment would train "
        "on the full dataset with more epochs and likely fine-tune more "
        "layers, given GPU access."
    )


if __name__ == "__main__":
    main()