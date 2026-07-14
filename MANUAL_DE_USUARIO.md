# Manual de Usuario - EcoScan

¡Bienvenido a **EcoScan**! Un sistema inteligente diseñado para ayudarte a clasificar tus residuos de forma rápida y precisa utilizando Inteligencia Artificial. Con solo una foto, podrás saber el tipo de residuo y recibir recomendaciones sobre cómo reciclarlo.

---

## 🌍 1. Introducción

EcoScan utiliza un conjunto de 4 modelos de Redes Neuronales Convolucionales (CNN) para analizar la imagen de un residuo y clasificarlo en una de las 9 categorías disponibles. Nuestro objetivo es facilitar el reciclaje y promover prácticas más sostenibles.

---

## 🚀 2. Primeros Pasos

### 2.1 Pantalla de Bienvenida
Al ingresar a la aplicación web, verás una pantalla de bienvenida.
1. Haz clic en el botón **"Iniciar Clasificación →"**.
2. Espera unos breves segundos mientras el sistema carga los modelos de IA en tu navegador de forma segura.

### 2.2 Interfaz Principal
Una vez iniciada la aplicación, encontrarás las siguientes secciones principales:
- **Zona de carga:** Para subir fotos o tomar una desde tu cámara.
- **Selector de Modo:** Para elegir entre modo *Ensamble* o *Cascada*.
- **Historial y Estadísticas:** Para ver tus clasificaciones anteriores.

---

## 📸 3. ¿Cómo clasificar un residuo?

Tienes dos opciones principales para proporcionar una imagen al sistema:

### Opción A: Subir una foto guardada
1. En la zona central, haz clic en **"Seleccionar foto"** o simplemente **arrastra y suelta** el archivo de la imagen en el recuadro.
2. Selecciona la imagen desde tus archivos (Formatos soportados: JPEG, PNG, WebP. Máx 20 MB).

### Opción B: Usar tu cámara
1. Haz clic en el botón **"Usar cámara"**.
2. Otorga los permisos de cámara a tu navegador si te los solicita.
3. Encuadra el residuo en la pantalla y presiona **"Tomar foto"**.

### Iniciar el Análisis
Una vez seleccionada o tomada la foto:
1. Verás una vista previa de la imagen.
2. Haz clic en el botón verde **"Clasificar"**.
3. El sistema procesará la imagen y mostrará el resultado en unos instantes.

*(Si deseas probar con otra foto antes de clasificar, puedes hacer clic en **"Limpiar"**).*

---

## 📊 4. Entendiendo los Resultados

Al finalizar la clasificación, el sistema te mostrará un panel con los resultados:

* **Categoría Principal:** Verás el nombre del residuo (ej. Plástico, Cartón) acompañado de un porcentaje de **Confianza** (ej. 92%). Esto indica qué tan seguro está el sistema de su predicción.
* **Desglose por modelo:** EcoScan usa 4 modelos internamente. Podrás ver qué opinó cada modelo por separado, lo cual es útil si la imagen era confusa.
* **📍 Lugares para Reciclar:** Si el sistema identifica el residuo como reciclable, habilitará el botón **"Lugares para Reciclar"**. Al pulsarlo, se abrirá un mapa interactivo (basado en tu ubicación) mostrándote los puntos de acopio o contenedores de reciclaje más cercanos a ti.

---

## ⚙️ 5. Modos de Predicción

EcoScan te permite elegir entre dos modos de análisis, ubicados justo debajo de los botones de carga de imagen:

* **Modo Ensamble (Recomendado):** 
  Es el modo por defecto. Utiliza los 4 modelos de IA al mismo tiempo y promedia sus respuestas para darte el resultado más preciso posible. 
* **Modo Cascada:**
  Prioriza la velocidad. Evalúa la foto usando el primer modelo; si este está muy seguro, te da el resultado inmediatamente sin consultar al resto. Si tiene dudas, va escalando a los modelos más complejos. Ideal para imágenes claras y evidentes.

---

## 🗂️ 6. Historial y Estadísticas

* **Historial:** Haz clic en el botón **"Historial"** en la pantalla principal para ver una lista de todas las clasificaciones que has realizado durante tu sesión. 
* **Estadísticas:** En la parte inferior de la página, encontrarás un gráfico que resume visualmente los tipos de residuos que más has escaneado.

---

## ♻️ 7. Categorías Soportadas

El sistema está entrenado para reconocer las siguientes 9 categorías:

| Icono | Categoría | ¿Qué incluye? |
|:---:|:---|:---|
| 📦 | **Cardboard (Cartón)** | Cajas, cartón corrugado, empaques. |
| 📄 | **Paper (Papel)** | Hojas de papel, periódicos, revistas, folletos. |
| 🧴 | **Plastic (Plástico)** | Botellas PET, envases, bolsas y empaques plásticos. |
| 🫙 | **Glass (Vidrio)** | Botellas, frascos y fragmentos de vidrio. |
| 🔩 | **Metal** | Latas de aluminio, conservas, alambre, utensilios. |
| 🥬 | **Organic (Orgánico)** | Restos de comida, cáscaras de fruta, hojas, ramas. |
| 👕 | **Textile (Textiles)** | Ropa vieja, retazos de tela, hilos. |
| 💻 | **E-Waste (Electrónicos)** | Teléfonos, cables, pilas, teclados, componentes eléctricos. |
| 🗑️ | **Trash (Basura general)** | Residuos mixtos, sucios o que no entran en categorías reciclables. |

---
*¡Gracias por usar EcoScan y contribuir a un mundo más limpio mediante el reciclaje correcto!*
