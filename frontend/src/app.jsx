import { Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./pages/LoginPage.jsx";
import PatientDashboard from "./pages/PatientDashboard.jsx";
import DoctorDashboard from "./pages/DoctorDashboard.jsx";

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
        path="/doctor"
        element={
          <ProtectedRoute role="doctor">
            <DoctorDashboard />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}