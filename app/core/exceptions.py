class WeatherServiceError(Exception):
    """Base exception for expected weather service failures."""


class WeatherInputError(WeatherServiceError):
    """Raised when user-provided weather input is invalid."""


class WeatherConfigurationError(WeatherServiceError):
    """Raised when the weather provider configuration is missing."""


class WeatherProviderError(WeatherServiceError):
    """Raised when an upstream weather provider cannot return usable data."""