import React, { useState, useEffect } from 'react';
import './LiveCompiler.css';

const LiveCompiler = ({ onBack }) => {
    const [code, setCode] = useState(`{\n  Sensor: DHT22,\n  Zona: "Revision 1",\n  Temperatura: 25,\n  Humedad: 60,\n  Estado: Normal\n}`);
    const [results, setResults] = useState({
        lexico: [],
        sintactico: {},
        semantico: {},
        errores: []
    });
    const [loading, setLoading] = useState(false);

    const analizarCodigo = async (input) => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token'); // Recuperamos el token guardado al hacer login

            const response = await fetch('http://localhost:3000/api/dext/analizar-debug', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` // Enviamos el token para autenticarnos
                },
                body: JSON.stringify({ contenido: input })
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Error del servidor: ${response.status}`);
            }

            const data = await response.json();
            setResults(data);
        } catch (err) {
            setResults(prev => ({ 
                ...prev, 
                errores: [`Error: ${err.message}. Asegúrate de que el backend esté corriendo en el puerto 3000.`] 
            }));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            analizarCodigo(code);
        }, 500); // Debounce para no saturar el servidor mientras se escribe
        return () => clearTimeout(timeoutId);
    }, [code]);

    const renderTokensReconstructed = (tokens) => {
        if (!tokens || tokens.length === 0) return "Esperando entrada...";
        
        let output = "";
        let lastLine = tokens[0].startLine;

        tokens.forEach((t, index) => {
            // Si hay un salto de línea en el código original, lo replicamos en la vista de tokens
            if (t.startLine > lastLine) {
                output += "\n".repeat(t.startLine - lastLine);
                lastLine = t.startLine;
                // Indentación básica si no es el cierre del objeto
                if (t.name !== 'RCurly') output += "  ";
            } else if (index > 0) {
                output += " "; // Espacio entre tokens en la misma línea
            }
            
            output += t.name;
        });

        return output;
    };

    return (
        <div className="live-compiler-container">
            <header className="compiler-header">
                <button onClick={onBack} className="btn-back">← Volver al Dashboard</button>
                <h2>Compilador en Vivo</h2>
                {loading && <span className="loader-status">Analizando...</span>}
            </header>

            <div className="compiler-grid">
                {/* Panel 1: Léxico (Tokens Reconstruidos) */}
                <div className="panel">
                    <h3>1. Análisis Léxico (Tokens)</h3>
                    <pre className="token-reconstruction">{renderTokensReconstructed(results.lexico)}</pre>
                </div>

                {/* Panel 2: Sintáctico */}
                <div className="panel">
                    <h3>2. Análisis Sintáctico</h3>
                    <p className="panel-description">
                        Árbol de derivación basado en la gramática.
                    </p>
                    <pre>{JSON.stringify(results.sintactico, null, 2)}</pre>
                </div>

                {/* Panel 3: Semántico */}
                <div className="panel">
                    <h3>3. Análisis Semántico (Objetos mandados por cada sensor)</h3>
                    <pre>{JSON.stringify(results.semantico, null, 2)}</pre>
                </div>

                {/* Panel 4: Errores */}
                <div className="panel errors-panel">
                    <h3>4. Errores y Advertencias</h3>
                    <div className="error-list">
                        {results.errores.length === 0 && <p className="no-errors">Sin errores detectados.</p>}
                        {results.errores.map((err, i) => (
                            <div key={i} className="error-item">{err}</div>
                        ))}
                    </div>
                </div>

                {/* Panel 5: Editor (Input de Objetos) */}
                <div className="panel editor-panel">
                    <h3>5. Editor de Objetos (Simular Sensores)</h3>
                    <textarea 
                        value={code} 
                        onChange={(e) => setCode(e.target.value)}
                        spellCheck="false"
                        placeholder="Escribe el objeto del sensor aquí..."
                    />
                </div>
            </div>
        </div>
    );
};

export default LiveCompiler;