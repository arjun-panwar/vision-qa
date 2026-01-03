# YOLO Visualization Tool - Usage Guide

This guide provides instructions on how to set up, run, and use the YOLO Visualization Tool.

## Prerequisites

- **Conda**: Ensure you have Conda installed.
- **Python Environment**: The application requires a Python environment (e.g., `yolo_viz`).

## Running the Application

To start the backend server, run the following command in your terminal:

```bash
conda run -n yolo_viz uvicorn backend.main:app --host 0.0.0.0 --port 8765 --reload
```

This command:
- Uses the `yolo_viz` conda environment.
- Starts the `uvicorn` server with the FastAPI app (`backend.main:app`).
- Hosts it on `0.0.0.0` (accessible from other machines).
- Runs on port `8765`.
- Enables auto-reload for development.

## Accessing the Tool

Once the server is running, open your web browser and navigate to:

[http://localhost:8765](http://localhost:8765)

## Basic Usage

1.  **Load Project**:
    - Click "Load Project" in the top right.
    - You can use the file browser or manually enter the path to your project folder.
    - The project folder must contain a `model_config.yaml`.

2.  **View Images**:
    - Select an image from the list on the left sidebar.
    - Use "Previous" and "Next" buttons or arrow keys to navigate.

3.  **Visualization Controls**:
    - **Zoom**: Use `+`, `-`, or `Reset` buttons, or scroll wheel on the canvas.
    - **Models**: Toggle visibility of different models in the right sidebar.
    - **Classes**: Filter specific object classes.
    - **Confidence**: Adjust the confidence threshold slider.
    - **Visual Settings**: Adjust line thickness, font size, and opacity.

4.  **QA Workflow**:
    - Mark images as "Correct", "Incorrect", or "Doubtful" using the buttons at the bottom.
    - Add comments if necessary.
    - Status is saved to `qa_status.xlsx` in your project folder.
