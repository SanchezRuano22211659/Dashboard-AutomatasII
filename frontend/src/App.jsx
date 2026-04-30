import { useState } from "react";
import "./App.css";
import Dashboard from "./Dashboard";
import Login from "./components/Login";
import LiveCompiler from "./LiveCompiler";
import { AuthProvider, useAuth } from "./context/AuthContext";

function AppInterna() {
    const { usuario, cargando, logout } = useAuth();
    const [vista, setVista] = useState("dashboard"); // "dashboard" o "compiler"

    if (cargando) {
        return (
            <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "100vh",
                background: "#090f1a",
                color: "#94a3b8",
                fontSize: "1rem",
            }}>
                Cargando sesión...
            </div>
        );
    }

    if (!usuario) {
        return <Login />;
    }

    if (vista === "compiler") {
        return <LiveCompiler onBack={() => setVista("dashboard")} />;
    }

    return <Dashboard onLogout={logout} onOpenCompiler={() => setVista("compiler")} />;
}

function App() {
    return (
        <AuthProvider>
            <AppInterna />
        </AuthProvider>
    );
}

export default App;
