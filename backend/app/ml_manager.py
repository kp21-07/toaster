from ultralytics import YOLO
import os
from typing import Optional, Any

class MLManager:
    """
    Singleton class to manage the loading and access of machine learning models.
    """
    _instance: Optional['MLManager'] = None

    def __new__(cls) -> 'MLManager':
        if cls._instance is None:
            cls._instance = super(MLManager, cls).__new__(cls)
            cls._instance.initialized = False
        return cls._instance

    def __init__(self) -> None:
        """
        Initializes the MLManager instance.
        """
        if self.initialized:
            return 

        self.comp_model: Optional[YOLO] = None
        self.wire_model: Optional[YOLO] = None
        self.initialized: bool = True

    def load_models(self, comp_model_path: str, wire_model_path: str) -> None:
        """
        Loads the component and wire detection models from the specified paths.

        Args:
            comp_model_path (str): The file path to the component detection model.
            wire_model_path (str): The file path to the wire endpoint detection model.
        """
        print(f"Loading Component Model from: {comp_model_path}...")
        self.comp_model = YOLO(comp_model_path)
 
        print(f"Loading Wire Model from: {wire_model_path}...")
        self.wire_model = YOLO(wire_model_path)

        print("Loaded Models successfully")

    def get_component_model(self) -> YOLO:
        """
        Retrieves the loaded component detection model.

        Returns:
            YOLO: The YOLO model instance for component detection.

        Raises:
            RuntimeError: If the model has not been loaded.
        """
        if not self.comp_model:
            raise RuntimeError("Component model not loaded. Call load_models() first.")
        return self.comp_model

    def get_wire_model(self) -> YOLO:
        """
        Retrieves the loaded wire endpoint detection model.

        Returns:
            YOLO: The YOLO model instance for wire detection.

        Raises:
            RuntimeError: If the model has not been loaded.
        """
        if not self.wire_model:
            raise RuntimeError("Wire model not loaded. Call load_models() first.")
        return self.wire_model

ml_engine = MLManager()
