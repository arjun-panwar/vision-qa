# builtin imports
from os.path import dirname, join

# pypi imports
from dotenv import load_dotenv

dotenv_path = join(dirname(__file__), "..", "..", ".env")
load_dotenv(dotenv_path)
