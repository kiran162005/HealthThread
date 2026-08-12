import { Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./pages/LoginPage.jsx";
import PatientDashboard from "./pages/PatientDashboard.jsx";
import SymptomChecker from "./pages/SymptomChecker.jsx";
import MedicalRecords from "./pages/MedicalRecords.jsx";
import DoctorDashboard from "./pages/DoctorDashboard.jsx";
import DoctorPatientView from "./pages/DoctorPatientView.jsx";

function getRole() {
  return localStorage.getItem("role");
}

function ProtectedRoute({ role, children }) {
  const token = localStorage.getItem("access_token");
  if (!token) return <Navigate to="/login" replace />;
  if (role && getRole() !== role) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/patient"
        element={
          <ProtectedRoute role="patient">
            <PatientDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/patient/symptom-check"
        element={
          <ProtectedRoute role="patient">
            <SymptomChecker />
          </ProtectedRoute>
        }
      />
      <Route
        path="/patient/records"
        element={
          <ProtectedRoute role="patient">
            <MedicalRecords />
          </ProtectedRoute>
        }
      />
      <Route
        path="/doctor"
        element={
          <ProtectedRoute role="doctor">
            <DoctorDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/doctor/patients/:patientId"
        element={
          <ProtectedRoute role="doctor">
            <DoctorPatientView />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}