"""Engine for the executable specs (``docs/**/*.spec.md``).

Dev/test tooling for building habit-hooks, not shipped product code. The grammar
contract is ``docs/executable_spec.md``. pytest is the runner (see
``conftest.py``); this package only parses (`parse_spec`) and runs (`execute`).
"""

from .errors import SpecError, SpecFailure
from .parser import SpecCase, parse_spec
from .runner import execute
from .text import normalize

__all__ = ["SpecCase", "SpecError", "SpecFailure", "execute", "normalize", "parse_spec"]
