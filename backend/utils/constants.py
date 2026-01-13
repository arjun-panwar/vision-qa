import yaml
from backend.utils._logger import logger  # noqa: E402, F401
import backend.utils.settings  # noqa: E402, F401


def load_config(path):
    """
    Load project configuration from a YAML file.

    Args:
        path (str): Path to the configuration file. Defaults to './static/config.yaml'.

    Returns:
        dict: Parsed configuration as a dictionary.
    """
    logger.info(f"Loading config from {path}")
    with open(path, 'r') as file:
        config = yaml.load(file, Loader=yaml.FullLoader)
    return config


# Load environment configuration from env.yaml
ENV_CONFIG = load_config(path="./static/env.yaml")

# Get CONFIG_PATH from env.yaml, fallback to default if not found
CONFIG_PATH = ENV_CONFIG.get('CONFIG_PATH', "./static/config.yaml")

# Load the main project configuration using the path from env.yaml
PROJECT_CONFIG = load_config(path=CONFIG_PATH)
