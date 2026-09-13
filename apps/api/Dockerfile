# Dockerfile para FastAPI ERP Backend
FROM python:3.11-slim

WORKDIR /app

# Instalar dependencias del sistema necesarias para asyncpg y otros paquetes buildeds
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copiar requirements primero para aprovechar caché de capas de Docker
COPY requirements.txt .

# Instalar dependencias de Python
RUN pip install --no-cache-dir -r requirements.txt

# Copiar el código fuente
COPY . .

# Exponer el puerto
EXPOSE 3001

# Comando para iniciar la aplicación
# NOTA (v7): --reload desactivado para evitar reinicios en vivo durante la
# implementación del módulo de almacenes. Reactivar solo en desarrollo local
# aislado, nunca con el POS operando.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3001"]
