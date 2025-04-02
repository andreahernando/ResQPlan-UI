const restriccionesInput = document.getElementById("restricciones-input");
const restriccionesList = document.querySelector(".restricciones-list");
const agregarBtn = document.querySelector(".btn.add");
const uploadBtn = document.getElementById("upload-btn");
const fileInput = document.getElementById("file-input");
const notification = document.getElementById("notification");

// Modal
const modal = document.getElementById("modal");
const modalBody = document.querySelector(".modal-body");
const closeBtn = document.querySelector(".close-btn");
const editBtn = document.querySelector(".edit-btn");
const downloadBtn = document.querySelector(".download-btn");
const sendRestrictionsBtn = document.getElementById("send-restrictions-btn");



document.addEventListener("DOMContentLoaded", () => {
    const restriccionesInput = document.getElementById("restricciones-input");
    restriccionesInput.focus();
});

// Función para mostrar notificaciones
function showNotification(type, message) {
    const notification = document.createElement('div');
    notification.classList.add('notification', 'show', type);

    // Agregar ícono según el tipo
    const icon = document.createElement('span');
    icon.classList.add('icon');
    if (type === 'success') icon.textContent = '✔️';
    else if (type === 'error') icon.textContent = '❌';
    else if (type === 'warning') icon.textContent = '⚠️';

    const text = document.createElement('span');
    text.textContent = message;

    // Agregar elementos a la notificación
    notification.appendChild(icon);
    notification.appendChild(text);

    // Agregar la notificación al body
    document.body.appendChild(notification);

    // Eliminar notificación después de 3 segundos
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300); // Esperar animación
    }, 3000);
}

// Agregar restricciones
agregarBtn.addEventListener("click", () => {
    const texto = restriccionesInput.value.trim();
    if (texto === "") {
        showNotification("warning", "Por favor, escribe al menos una restricción antes de agregar.");
        return;
    }

    // Dividir el texto por bloques separados por líneas vacías
    const restricciones = texto.split(/\n\s*\n/).map((bloque) => bloque.trim());

    restricciones.forEach((bloque) => {
        if (bloque) { // Solo añade los bloques no vacíos
            const nuevaRestriccion = document.createElement("div");
            nuevaRestriccion.classList.add("restriccion");

            const botonesGrupo = document.createElement("div");
            botonesGrupo.classList.add("btn-group");

            const botonEditar = document.createElement("button");
            botonEditar.classList.add("btn", "edit");
            botonEditar.setAttribute("data-tooltip", "Editar");
            botonEditar.textContent = "✏️";

            const botonEliminar = document.createElement("button");
            botonEliminar.classList.add("btn", "delete");
            botonEliminar.setAttribute("data-tooltip", "Eliminar");
            botonEliminar.textContent = "🗑️";

            botonesGrupo.appendChild(botonEditar);
            botonesGrupo.appendChild(botonEliminar);

            nuevaRestriccion.innerHTML = bloque;
            nuevaRestriccion.appendChild(botonesGrupo);
            restriccionesList.appendChild(nuevaRestriccion);
        }
    });

    restriccionesInput.value = ""; // Limpiar el cuadro de texto después de agregar
    showNotification("success", "Restricciones agregadas correctamente.");
});


// Evento para abrir el selector de archivos
uploadBtn.addEventListener("click", () => {
    fileInput.click();
});

// Evento para procesar el archivo seleccionado
fileInput.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (file.type !== "text/plain") {
        showNotification("error", "Por favor, sube un archivo de texto válido.");
        return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
        restriccionesInput.value = e.target.result;
        showNotification("success", "Archivo cargado correctamente.");
    };
    reader.readAsText(file);
});

// Función para mostrar el modal
function showModal() {
    modal.style.display = "flex";
}

// Función para ocultar el modal
function closeModal() {
    modal.style.display = "none";
}
// Cerrar modal al hacer clic en el botón de cerrar
closeBtn.addEventListener("click", closeModal);

// Cerrar modal al hacer clic fuera del contenido
modal.addEventListener("click", (event) => {
    if (event.target === modal) {
        closeModal();
    }
});

// Función para enviar restricciones al servidor
async function sendRestrictions() {
    const restricciones = []; // Aquí obtendremos las restricciones desde el DOM
    const restriccionesElems = document.querySelectorAll(".restriccion");

    restriccionesElems.forEach((elem) => {
        restricciones.push(elem.textContent.trim());
    });

    if (restricciones.length === 0) {
        showNotification("warning", "Por favor, añade al menos una restricción antes de enviarlas.");
        return;
    }

    try {
        // Realizar la solicitud POST al servidor
        const response = await fetch("/resolver", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ restricciones }),
        });

        const result = await response.json();

        if (response.ok) {
            // Mostrar mensaje en el modal
            modalBody.innerHTML = `<p>${result.message}</p>`;
            showModal();
        } else {
            alert(`Error: ${result.message}`);
        }
    } catch (error) {
        console.error("Error al enviar restricciones:", error);
        showNotification("error", "Hubo un problema al enviar las restricciones.");
    }
}

// Agregar evento al botón de envío
sendRestrictionsBtn.addEventListener("click", sendRestrictions);

restriccionesList.addEventListener("click", (event) => {
    if (event.target.classList.contains("delete")) {
        const restriccion = event.target.closest(".restriccion");
        if (restriccion) {
            restriccion.remove();
            showNotification("success", "Restricción eliminada correctamente.");
        }
    }

    if (event.target.classList.contains("edit")) {
        const restriccion = event.target.closest(".restriccion");
        if (restriccion) {
            // Obtener el texto actual de la restricción
            const textoActual = restriccion.firstChild.textContent.trim();

            // Crear un campo de edición (input o textarea)
            const inputEdicion = document.createElement("input");
            inputEdicion.type = "text";
            inputEdicion.value = textoActual;
            inputEdicion.classList.add("edit-input");

            // Reemplazar el texto con el campo de edición
            restriccion.firstChild.replaceWith(inputEdicion);
            inputEdicion.focus();

            // Manejar el evento al terminar la edición
            const guardarEdicion = () => {
                const nuevoTexto = inputEdicion.value.trim();
                if (nuevoTexto !== "") {
                    // Crear un nodo de texto actualizado
                    const textoActualizado = document.createTextNode(nuevoTexto);

                    // Reemplazar el campo de edición con el texto actualizado
                    inputEdicion.replaceWith(textoActualizado);
                    showNotification("success", "Restricción editada correctamente.");
                } else {
                    showNotification("error", "La restricción no puede estar vacía.");
                }
            };

            // Guardar al presionar Enter
            inputEdicion.addEventListener("keypress", (e) => {
                if (e.key === "Enter") {
                    guardarEdicion();
                }
            });

            // Guardar al perder el foco
            inputEdicion.addEventListener("blur", guardarEdicion);
        }
    }

});