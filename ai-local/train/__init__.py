"""Paquete de entrenamiento (fine-tuning) del motor de IA Local.

v7 (Fase 8): contiene el pipeline de fine-tuning de YOLO sobre el dataset
de panaderia anotado por el operador.

Este paquete NO se importa al arrancar el motor: solo lo invoca el endpoint
/vision/train como subproceso (para no bloquear el event loop).
"""
