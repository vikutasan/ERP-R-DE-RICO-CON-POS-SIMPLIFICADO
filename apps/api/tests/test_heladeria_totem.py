"""V16 (Fase 16.2): tests del almacenamiento de imagenes del Display Totem.

Guardian del contrato del modulo `totem_storage.py`:
  1. `sanitize_filename` neutraliza path traversal.
  2. `save_totem_image` rechaza tipos MIME no permitidos.
  3. `save_totem_image` rechaza archivos > 8 MB.
  4. `save_totem_image` rechaza archivos vacios.
  5. `save_totem_image` guarda y devuelve filename + url correctos.
  6. `delete_totem_image` borra el archivo fisico.
  7. `delete_totem_image` no borra fuera del directorio (path traversal).

Regla de oro: NUNCA se toca el POS. Estos tests solo escriben en el
directorio temporal `media/totem` y limpian lo que crean.
"""
import os
import pytest

from modules.heladeria import totem_storage


# Bytes minimos de un PNG valido (cabecera) para las pruebas.
PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32


def _limpiar(filename):
    """Borra un archivo de prueba si existe."""
    path = os.path.join(totem_storage.TOTEM_MEDIA_DIR, filename)
    if os.path.isfile(path):
        os.remove(path)


class TestSanitizeFilename:
    """El saneo es la primera linea de defensa contra path traversal."""

    def test_neutraliza_path_traversal(self):
        assert ".." not in totem_storage.sanitize_filename("../../etc/passwd")
        assert "/" not in totem_storage.sanitize_filename("../../etc/passwd")

    def test_conserva_nombre_seguro(self):
        assert totem_storage.sanitize_filename("helado.png") == "helado.png"

    def test_genera_nombre_para_entrada_vacia(self):
        nombre = totem_storage.sanitize_filename("")
        assert nombre.startswith("totem_")

    def test_descarta_ruta_absoluta(self):
        assert totem_storage.sanitize_filename("C:\\Windows\\evil.png") == "evil.png"


class TestSaveTotemImage:
    """El backend es el guardian autoritativo de la validacion."""

    def test_rechaza_tipo_no_permitido(self):
        with pytest.raises(ValueError, match="Tipo no permitido"):
            totem_storage.save_totem_image(PNG_BYTES, "x.gif", "image/gif")

    def test_rechaza_archivo_mayor_a_8mb(self):
        grande = b"\x00" * (totem_storage.MAX_IMAGE_BYTES + 1)
        with pytest.raises(ValueError, match="8 MB"):
            totem_storage.save_totem_image(grande, "x.png", "image/png")

    def test_rechaza_archivo_vacio(self):
        with pytest.raises(ValueError, match="vac"):
            totem_storage.save_totem_image(b"", "x.png", "image/png")

    def test_guarda_y_devuelve_url(self):
        result = totem_storage.save_totem_image(PNG_BYTES, "helado.png", "image/png")
        try:
            assert result["filename"].endswith(".png")
            assert result["url"] == f"/media/totem/{result['filename']}"
            path = os.path.join(totem_storage.TOTEM_MEDIA_DIR, result["filename"])
            assert os.path.isfile(path)
        finally:
            _limpiar(result["filename"])


class TestDeleteTotemImage:
    """El borrado limpia el archivo fisico y respeta el directorio."""

    def test_borra_archivo_fisico(self):
        result = totem_storage.save_totem_image(PNG_BYTES, "borrar.png", "image/png")
        path = os.path.join(totem_storage.TOTEM_MEDIA_DIR, result["filename"])
        assert os.path.isfile(path)
        assert totem_storage.delete_totem_image(result["filename"]) is True
        assert not os.path.isfile(path)

    def test_no_borra_fuera_del_directorio(self):
        # Un intento de traversal se sanea y no encuentra el archivo.
        assert totem_storage.delete_totem_image("../../etc/passwd") is False

    def test_borrar_inexistente_devuelve_false(self):
        assert totem_storage.delete_totem_image("no_existe_12345.png") is False
