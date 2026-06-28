"""Exceptions raised while parsing or running a spec."""


class SpecError(Exception):
    """A spec is malformed (a parse-time problem)."""


class SpecFailure(Exception):
    """A test assertion failed or a step errored at run time."""
