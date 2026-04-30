import "./Dashboard.css";
import Card from "./components/Card";
import Nav from "./components/Nav";
import Preview from "./components/Preview";
import { useAuth } from "./context/AuthContext";
import { useSensoresDisponibles, useUltimasLecturas, useLecturasSensor } from "./hooks/useSensores";
import { useState } from "react";

function Dashboard({ onLogout, onOpenCompiler }) {
    const { usuario } = useAuth();

    const [selectedSensor, setSelectedSensor] = useState("");
    const [selectedTime, setSelectedTime] = useState("5");
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);

    const { sensores } = useSensoresDisponibles();
    const { lecturas: ultimasLecturas, cargando: cargandoCards } = useUltimasLecturas();
    const { lecturas: lecturasFiltradas, cargando: cargandoPreview } = useLecturasSensor(selectedSensor, selectedTime);

    const tarjetas = Object.entries(ultimasLecturas);

    return (
        <main>
            <header>
                <h1>VISEN</h1>
                <div className="header_usuario">
                    <span className="header_bienvenida">
                        {usuario?.username}
                        <small className="header_rol">{usuario?.rol}</small>
                    </span>
                <button className="header_btn_logout" onClick={onOpenCompiler}>
                        Compilador en vivo
                    </button>
                    <button className="header_btn_logout" onClick={onLogout}>
                        Cerrar sesión
                    </button>
                </div>
            </header>

            <Nav
                sensores={sensores}
                onSensorChange={setSelectedSensor}
                onTimeChange={setSelectedTime}
                selectedSensor={selectedSensor}
                selectedTime={selectedTime}
                onPreviewClick={() => setIsPreviewOpen(true)}
            />

            <section id="dashboard-main-section-panel">
                {cargandoCards && tarjetas.length === 0 && (
                    <div className="dashboard_estado">Cargando lecturas...</div>
                )}

                {!cargandoCards && tarjetas.length === 0 && (
                    <div className="dashboard_estado">No hay lecturas registradas aún.</div>
                )}

                {tarjetas.map(([nombreSensor, datos], i) => {
                    // Las primeras 3 tarjetas ocupan 2 columnas
                    // Las siguientes alternan entre 1 columna y 2 filas de altura
                    const anchas = i < 3;
                    const altas = !anchas && (i - 3) % 4 < 2;
                    const className = anchas ? "spanCol2" : altas ? "spanRow2" : undefined;

                    return (
                        <Card
                            key={nombreSensor}
                            id={`sensor-${nombreSensor}`}
                            className={className}
                            data={datos}
                        />
                    );
                })}
            </section>

            <Preview
                isOpen={isPreviewOpen}
                onClose={() => setIsPreviewOpen(false)}
                selectedSensor={selectedSensor}
                selectedTime={selectedTime}
                lecturas={lecturasFiltradas}
                cargando={cargandoPreview}
            />
        </main>
    );
}

export default Dashboard;
