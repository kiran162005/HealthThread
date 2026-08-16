"""Runs inference with the ResNet18 skin lesion classifier trained by
scripts/train_skin_classifier.py.

Loads ml_models/skin_classifier.pth and ml_models/class_labels.json once
at import time (not per-request) — weights are ~45MB and loading them on
every call would be wasteful. See that script's docstring for the
training tradeoffs (subset of data, frozen backbone, few epochs): this
is a portfolio-scoped model, not a clinical-grade one, and the response
below says so explicitly rather than implying more confidence than
0.708 val accuracy warrants.
"""
import io
import json
from pathlib import Path

import torch
import torch.nn.functional as F
from PIL import Image
from torchvision import models, transforms

_MODEL_DIR = Path(__file__).parent.parent.parent / "ml_models"
_WEIGHTS_PATH = _MODEL_DIR / "skin_classifier.pth"
_LABELS_PATH = _MODEL_DIR / "class_labels.json"

# mel (melanoma), bcc (basal cell carcinoma), akiec (actinic keratosis /
# early squamous cell carcinoma) are the categories worth flagging —
# matches the comment in train_skin_classifier.py's CLASS_NAMES.
_FLAG_CLASSES = {"mel", "bcc", "akiec"}

_IMAGE_SIZE = 128  # must match training

_transform = transforms.Compose([
    transforms.Resize((_IMAGE_SIZE, _IMAGE_SIZE)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
])

_model = None
_class_names = None


def _load_model():
    """Lazy singleton — avoids loading torch weights at import time if
    this module is imported but never used (e.g. during tests).
    """
    global _model, _class_names
    if _model is not None:
        return

    if not _WEIGHTS_PATH.exists() or not _LABELS_PATH.exists():
        raise RuntimeError(
            "Skin classifier model files not found. Run "
            "scripts/train_skin_classifier.py first to generate "
            f"{_WEIGHTS_PATH} and {_LABELS_PATH}."
        )

    _class_names = json.loads(_LABELS_PATH.read_text())

    model = models.resnet18(weights=None)
    model.fc = torch.nn.Linear(model.fc.in_features, len(_class_names))
    model.load_state_dict(torch.load(_WEIGHTS_PATH, map_location="cpu"))
    model.eval()
    _model = model


def classify_image(image_bytes: bytes) -> dict:
    """Returns the predicted class, confidence, full per-class
    probability breakdown, and whether this is one of the classes
    worth flagging for a doctor visit.
    """
    _load_model()

    try:
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception as e:
        raise ValueError(f"Could not read image: {e}")

    tensor = _transform(image).unsqueeze(0)  # add batch dimension

    with torch.no_grad():
        logits = _model(tensor)
        probs = F.softmax(logits, dim=1).squeeze(0)

    top_idx = int(torch.argmax(probs).item())
    predicted_class = _class_names[top_idx]

    return {
        "predicted_class": predicted_class,
        "confidence": round(float(probs[top_idx]), 4),
        "all_probabilities": {
            name: round(float(probs[i]), 4) for i, name in enumerate(_class_names)
        },
        "flagged_for_doctor": predicted_class in _FLAG_CLASSES,
        "disclaimer": (
            "This is an experimental model trained on a small subset of "
            "data for portfolio purposes, not a diagnostic tool. It "
            "cannot rule anything in or out — please see a doctor for "
            "any skin change that concerns you, regardless of this result."
        ),
    }