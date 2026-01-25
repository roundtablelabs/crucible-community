"""Circuit breaker implementation for resilient API calls."""
import logging
import time
from enum import Enum
from typing import Callable, Any, Optional
from dataclasses import dataclass, field
from threading import Lock

logger = logging.getLogger(__name__)


class CircuitState(Enum):
    """Circuit breaker states."""
    CLOSED = "closed"  # Normal operation
    OPEN = "open"  # Failing, reject requests immediately
    HALF_OPEN = "half_open"  # Testing if service recovered


@dataclass
class CircuitBreakerConfig:
    """Configuration for circuit breaker."""
    failure_threshold: int = 5  # Open circuit after N failures
    success_threshold: int = 2  # Close circuit after N successes in half-open
    timeout: float = 60.0  # Seconds to wait before trying half-open
    expected_exception: type[Exception] = Exception  # Exception types that count as failures


@dataclass
class CircuitBreakerStats:
    """Statistics for circuit breaker."""
    failures: int = 0
    successes: int = 0
    last_failure_time: Optional[float] = None
    state: CircuitState = CircuitState.CLOSED
    _lock: Lock = field(default_factory=Lock)


class CircuitBreaker:
    """Circuit breaker pattern implementation."""
    
    def __init__(
        self,
        name: str,
        config: Optional[CircuitBreakerConfig] = None,
        on_state_change: Optional[Callable[[str, CircuitState], None]] = None
    ):
        """
        Initialize circuit breaker.
        
        Args:
            name: Name of the circuit breaker (for logging)
            config: Configuration for the circuit breaker
            on_state_change: Optional callback when state changes
        """
        self.name = name
        self.config = config or CircuitBreakerConfig()
        self.stats = CircuitBreakerStats()
        self.on_state_change = on_state_change
    
    def _transition_to(self, new_state: CircuitState) -> None:
        """Transition to a new state and notify callback."""
        if self.stats.state != new_state:
            old_state = self.stats.state
            self.stats.state = new_state
            logger.info(f"Circuit breaker '{self.name}' transitioned from {old_state.value} to {new_state.value}")
            
            if self.on_state_change:
                try:
                    self.on_state_change(self.name, new_state)
                except Exception as e:
                    logger.error(f"Error in circuit breaker state change callback: {e}")
    
    def _should_attempt(self) -> bool:
        """Check if we should attempt the operation."""
        with self.stats._lock:
            if self.stats.state == CircuitState.CLOSED:
                return True
            
            if self.stats.state == CircuitState.OPEN:
                # Check if timeout has passed
                if self.stats.last_failure_time is None:
                    return True
                
                elapsed = time.time() - self.stats.last_failure_time
                if elapsed >= self.config.timeout:
                    self._transition_to(CircuitState.HALF_OPEN)
                    self.stats.successes = 0
                    return True
                
                return False
            
            # HALF_OPEN state - allow attempts
            return True
    
    def _record_success(self) -> None:
        """Record a successful operation."""
        with self.stats._lock:
            self.stats.successes += 1
            self.stats.failures = 0
            
            if self.stats.state == CircuitState.HALF_OPEN:
                if self.stats.successes >= self.config.success_threshold:
                    self._transition_to(CircuitState.CLOSED)
    
    def _record_failure(self) -> None:
        """Record a failed operation."""
        with self.stats._lock:
            self.stats.failures += 1
            self.stats.last_failure_time = time.time()
            
            if self.stats.state == CircuitState.HALF_OPEN:
                # Any failure in half-open goes back to open
                self._transition_to(CircuitState.OPEN)
            elif self.stats.state == CircuitState.CLOSED:
                if self.stats.failures >= self.config.failure_threshold:
                    self._transition_to(CircuitState.OPEN)
    
    def call(self, func: Callable[..., Any], *args: Any, **kwargs: Any) -> Any:
        """
        Execute a function with circuit breaker protection.
        
        Args:
            func: Function to execute
            *args: Positional arguments for function
            **kwargs: Keyword arguments for function
            
        Returns:
            Result of function call
            
        Raises:
            CircuitBreakerOpenError: If circuit is open
            Exception: Any exception raised by the function
        """
        if not self._should_attempt():
            raise CircuitBreakerOpenError(
                f"Circuit breaker '{self.name}' is OPEN. "
                f"Last failure: {self.stats.last_failure_time}"
            )
        
        try:
            result = func(*args, **kwargs)
            self._record_success()
            return result
        except self.config.expected_exception as e:
            self._record_failure()
            raise
        except Exception as e:
            # Unexpected exceptions don't count as failures
            logger.warning(f"Unexpected exception in circuit breaker '{self.name}': {e}")
            raise
    
    async def call_async(self, func: Callable[..., Any], *args: Any, **kwargs: Any) -> Any:
        """
        Execute an async function with circuit breaker protection.
        
        Args:
            func: Async function to execute
            *args: Positional arguments for function
            **kwargs: Keyword arguments for function
            
        Returns:
            Result of function call
            
        Raises:
            CircuitBreakerOpenError: If circuit is open
            Exception: Any exception raised by the function
        """
        if not self._should_attempt():
            raise CircuitBreakerOpenError(
                f"Circuit breaker '{self.name}' is OPEN. "
                f"Last failure: {self.stats.last_failure_time}"
            )
        
        try:
            result = await func(*args, **kwargs)
            self._record_success()
            return result
        except self.config.expected_exception as e:
            self._record_failure()
            raise
        except Exception as e:
            # Unexpected exceptions don't count as failures
            logger.warning(f"Unexpected exception in circuit breaker '{self.name}': {e}")
            raise
    
    def reset(self) -> None:
        """Manually reset the circuit breaker to closed state."""
        with self.stats._lock:
            self.stats.failures = 0
            self.stats.successes = 0
            self.stats.last_failure_time = None
            self._transition_to(CircuitState.CLOSED)
    
    def get_state(self) -> CircuitState:
        """Get current circuit breaker state."""
        return self.stats.state


class CircuitBreakerOpenError(Exception):
    """Exception raised when circuit breaker is open."""
    pass


# Pre-configured circuit breakers for common services

# Per-provider LLM circuit breakers (to prevent one provider's failures from blocking others)
_LLM_CIRCUIT_BREAKERS: dict[str, CircuitBreaker] = {}
_LLM_CIRCUIT_BREAKERS_LOCK = Lock()

def get_llm_circuit_breaker(provider_name: str) -> CircuitBreaker:
    """Get or create a circuit breaker for a specific LLM provider.
    
    Args:
        provider_name: Name of the provider (e.g., "openai", "anthropic", "openrouter")
        
    Returns:
        Circuit breaker instance for the provider
    """
    with _LLM_CIRCUIT_BREAKERS_LOCK:
        if provider_name not in _LLM_CIRCUIT_BREAKERS:
            _LLM_CIRCUIT_BREAKERS[provider_name] = CircuitBreaker(
                name=f"llm_provider_{provider_name}",
                config=CircuitBreakerConfig(
                    failure_threshold=5,
                    success_threshold=2,
                    timeout=60.0,
                    expected_exception=Exception
                )
            )
        return _LLM_CIRCUIT_BREAKERS[provider_name]

def reset_llm_circuit_breaker(provider_name: str) -> bool:
    """Reset a specific provider's circuit breaker.
    
    Args:
        provider_name: Name of the provider to reset
        
    Returns:
        True if circuit breaker was reset, False if it doesn't exist
    """
    with _LLM_CIRCUIT_BREAKERS_LOCK:
        if provider_name in _LLM_CIRCUIT_BREAKERS:
            _LLM_CIRCUIT_BREAKERS[provider_name].reset()
            logger.info(f"Reset circuit breaker for provider: {provider_name}")
            return True
        return False

def reset_all_llm_circuit_breakers() -> None:
    """Reset all LLM provider circuit breakers."""
    with _LLM_CIRCUIT_BREAKERS_LOCK:
        for provider_name, breaker in _LLM_CIRCUIT_BREAKERS.items():
            breaker.reset()
            logger.info(f"Reset circuit breaker for provider: {provider_name}")

# Legacy shared circuit breaker (deprecated - use get_llm_circuit_breaker instead)
# Kept for backward compatibility but should not be used for new code
LLM_CIRCUIT_BREAKER = CircuitBreaker(
    name="llm_provider",
    config=CircuitBreakerConfig(
        failure_threshold=5,
        success_threshold=2,
        timeout=60.0,
        expected_exception=Exception
    )
)

# Database circuit breaker
DATABASE_CIRCUIT_BREAKER = CircuitBreaker(
    name="database",
    config=CircuitBreakerConfig(
        failure_threshold=10,
        success_threshold=3,
        timeout=30.0,
        expected_exception=Exception
    )
)

# External API circuit breaker
EXTERNAL_API_CIRCUIT_BREAKER = CircuitBreaker(
    name="external_api",
    config=CircuitBreakerConfig(
        failure_threshold=5,
        success_threshold=2,
        timeout=60.0,
        expected_exception=Exception
    )
)



