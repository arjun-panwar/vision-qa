import sys
from backend.utils._logger import logger
import os


def get_env_var(
    name,
    default=None,
    required=False,
    data_type=str,
    choices=None,
    case_sensitive=True,
):
    """
    Reads and validates a single environment variable.

    Args:
        name (str): The name of the environment variable.
        default: The default value if the environment variable is not set (optional).
        required (bool): Whether the environment variable is required (optional, default is False).
        data_type: The type to which the environment variable should be cast (optional, default is str).
        choices (list): A list of valid choices for the environment variable (optional).
        case_sensitive (bool): Whether the env variable is case sensitive. If set to False, convert to lower case for validation and usage. (optional, default is True)

    Returns:
        The parsed value of the environment variable.

    Raises:
        SystemExit: If a required environment variable is not set or a value is invalid.
    """
    value = os.getenv(name, default)

    if value is None:
        if required:
            logger.error(
                f"Environment variable '{name}' is required but not set in .env !"
            )
            sys.exit(1)
        else:
            return None

    if not case_sensitive:
        value = value.lower()

    try:
        value = data_type(value)
    except ValueError:
        logger.error(
            f"Environment variable '{name}' must be of type {data_type.__name__} !"
        )
        sys.exit(1)

    if choices and value not in choices:
        logger.error(f"Environment variable '{name}' must be one of {choices} !")
        sys.exit(1)

    return value
