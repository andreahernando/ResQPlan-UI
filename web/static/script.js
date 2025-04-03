document.addEventListener("DOMContentLoaded", function() {
    const okButton = document.getElementById('ok-button');
    const contextInput = document.getElementById('context');
    const loadingOverlay = document.getElementById('loading-overlay');

    // Ocultar la pantalla de carga al iniciar la página
    if (loadingOverlay) {
        loadingOverlay.style.display = "none";
    }

    function mostrarPantallaCarga() {
        loadingOverlay.style.display = "flex";
    }


    function continuar() {
        const context = contextInput.value.trim();
        if (!context) {
            alert("Por favor ingresa algún contexto.");
            return;
        }

        mostrarPantallaCarga();
        // Guardamos en sessionStorage que estamos cargando
        sessionStorage.setItem("cargando", "true");

        // Iniciar la petición, pero no esperar a que termine para redirigir
        fetch('/api/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ input_data: context })
        })
        .then(response => response.json())
        .then(data => {
            sessionStorage.setItem("variables", JSON.stringify(data.result));
            window.location.href = "/restricciones";
        })
        .catch(error => {
            console.error('Error:', error);
            alert("Error al contactar con la API.");
            sessionStorage.setItem("cargando", "error");
        })
        setTimeout(() => {
            window.location.href = "/restricciones";
        }, 5000);
    }

    if (okButton) {
        okButton.addEventListener("click", continuar);
    }

    if (contextInput) {
        contextInput.addEventListener("keypress", function(event) {
            if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                continuar();
            }
        });
    }

    const convertButton = document.getElementById('convert-button');
    if (convertButton) {
        convertButton.addEventListener('click', function() {
            const constraint = document.getElementById('constraint').value.trim();
            if (!constraint) {
                alert("Por favor ingresa una restricción.");
                return;
            }

            fetch('/api/convert', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ constraint: constraint })
            })
            .then(response => response.json())
            .then(data => {
                const lista = document.querySelector('.restricciones-list');
                const item = document.createElement('p');
                item.innerText = constraint;
                lista.appendChild(item);
            })
            .catch(error => {
                console.error('Error:', error);
                document.getElementById('constraint-result').innerText = "Error al contactar con la API.";
            });
        });
    }

    const optimizeButton = document.getElementById('optimize-button');
    if (optimizeButton) {
        optimizeButton.addEventListener('click', function() {
            fetch('/api/optimize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            })
            .then(response => response.json())
            .then(data => {
                const resultDiv = document.getElementById('optimization-result');
                resultDiv.style.display = 'block';

                if (typeof data.solution === 'object') {
                    resultDiv.innerText = "Solución encontrada:\n";
                } else {
                    resultDiv.innerText = data.solution;
                }
            })
            .catch(error => {
                console.error('Error:', error);
                document.getElementById('optimization-result').innerText = "Error al contactar con la API.";
            });
        });
    }
});
