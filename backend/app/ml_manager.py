from ultralytics import YOLO
import os

class MLManager:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(MLManager, cls).__new__(cls)
            cls._instance.initialized = False
        return cls._instance

    def __init__(self):
        if self.initialized:
            return 

        self.comp_model = None
        self.wire_model = None
        self.initialized = True

    def load_models(self, comp_model_path: str, wire_model_path: str):
        print(f"Loading Component Model from: {comp_model_path}...")
        self.comp_model = YOLO(comp_model_path)
 
        print(f"Loading Wire Model from: {wire_model_path}...")
        self.wire_model = YOLO(wire_model_path)

        print("Loaded Models successfully")

    def get_component_model(self):
        if not self.comp_model:
            raise RuntimeError("Component model not loaded. Call load_models() first.")
        return self.comp_model

    def get_wire_model(self):
        if not self.wire_model:
            raise RuntimeError("Wire model not loaded. Call load_models() first.")
        return self.wire_model

ml_engine = MLManager()
