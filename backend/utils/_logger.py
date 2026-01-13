# builtin imports
import atexit
from datetime import datetime, timezone
import os
import sys
from loguru import logger
from pathlib import Path

import backend.utils.settings  # noqa: F401


def rename_rotated_file(filepath):
    """
    Setting path of log file after rotation.

    Args:
        filepath (path): log file path
    """
    now = datetime.now(timezone.utc)
    directory, _ = os.path.split(filepath)
    new_filename = f"{now.strftime('D%Y%m%d_T%H%M%S_%f')}.log"
    new_path = os.path.join(directory, new_filename)
    os.rename(filepath, new_path)


def set_logger(
    is_enable=True,
    log_level="DEBUG",
    log_size_mb=None,
    rotation_hours="1",
    retention_hours=None,
    compression=None,
    stdout_logs=1,
    write_logs=0,
    logpath=None,
    app_name="",
):
    """function to define logger in the application

    Args:
        is_enable (bool, optional): enable/disable logs. Defaults to True.
        log_level (str, optional): log level used. Defaults to "DEBUG".
        log_size_mb (str, optional): If log file exceeds the size, logs are directed to a new file. Defaults to None.
        rotation_hours (str, optional): If difference of current time and log file time exceeds the limit defined, logs are directed to a new file. Defaults to "1".
        stdout_logs (int, optional): variable to pass logs to stdout. Defaults to 1.
        write_logs (int, optional): variable to write logs to a file/not. Defaults to 0.
        logpath (Path, optional): Path of the log file. Defaults to None.
        app_name (str, optional): Application name used in log. Defaults to "".

        NOTE: logpath is defined in a manner to include a base path and then the required path as followed by
        other applications to store frames.

        Also logpath is valid when we set write_logs to 1.

    Returns:
        None
    """
    if not app_name:
        logger.error("Application is not defined in the logger format. Exiting.")
        sys.exit(1)

    if is_enable:
        logger.remove()
        logging_format = f"{app_name} | {{time:YYYY-MM-DD HH:mm:ss.SSS!UTC}} | {{level}} | {{name}}:{{function}}:{{line}} | {{message}}"

        if write_logs:
            if logpath and isinstance(logpath, Path):
                start_datetime = datetime.now(timezone.utc)
                file_name = f"{start_datetime.strftime('D%Y%m%d_T%H%M%S_%f')}.log"

                logpath.mkdir(parents=True, exist_ok=True)
                logfile = Path(logpath, file_name)

                def logfile_printer():
                    return print(f"log file name : {logfile}")

                logger.add(
                    logfile,
                    format=logging_format,
                    colorize=False,
                    level=log_level,
                    rotation=f"{log_size_mb} MB"
                    if log_size_mb
                    else f"{rotation_hours} hours",
                    retention=f"{retention_hours} hours" if retention_hours else None,
                    compression=compression,
                    catch=True,
                    diagnose=True,
                    backtrace=True,
                )
                setattr(logger, "sink", logfile)
                atexit.register(logfile_printer)
            else:
                logger.warning("logpath is not defined. Logs wont be saved.")

        if stdout_logs:
            logger.add(
                sys.stdout,
                format=logging_format,
                colorize=False,
                level=log_level,
                catch=True,
                diagnose=True,
                backtrace=True,
            )
        logger.enable(app_name)
    else:
        logger.disable(app_name)


app_name = "VisionQA"
folder_name = "_".join(app_name.lower().split())
IS_PRODUCTION = os.getenv("PY_ENV", "production").lower() not in ["development", "qa"]
LOG_WRITE_PATH = os.getenv("LOG_WRITE_PATH", "temp")
logpath = Path(LOG_WRITE_PATH, "logs", folder_name)

set_logger(
    log_level=os.getenv("LOG_LEVEL", "DEBUG").upper(),
    rotation_hours=os.getenv("LOG_FILE_ROTATION_HOURS", default="1"),
    compression=os.getenv("LOG_FILE_COMPRESSION"),
    stdout_logs=int(os.getenv("STDOUT_LOGS", "1")),
    write_logs=int(os.getenv("WRITE_LOGS", "0")),
    logpath=logpath,
    app_name=app_name,
)
