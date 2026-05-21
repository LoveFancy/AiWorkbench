"""Configuration for DPMP API access."""


class DPMPConfig:
    """Configuration for DPMP Story creation.

    All values can be passed via CLI args (from pmconfig.md).
    """

    def __init__(
        self,
        cookie: str,
        project_id: int = 2232,
        task_type_id: int = 13,
        base_url: str = "http://pt.htsc/paas/dc/api",
        request_delay: int = 3,
        request_timeout: int = 30,
        iteration_id: int | None = None,
        item_id: int | None = None,
        flow_id: int | None = None,
        flow_sign_apply_id: int | None = None,
        current_state_id: int | None = None,
        rel_it_project_id: int | None = None,
    ) -> None:
        self.cookie = cookie
        self.project_id = project_id
        self.task_type_id = task_type_id
        self.base_url = base_url
        self.request_delay = request_delay
        self.request_timeout = request_timeout
        self.iteration_id = iteration_id
        self.item_id = item_id
        self.flow_id = flow_id
        self.flow_sign_apply_id = flow_sign_apply_id
        self.current_state_id = current_state_id
        self.rel_it_project_id = rel_it_project_id

    def validate(self) -> None:
        """Validate required configuration.

        Raises:
            ValueError: If required configuration is missing.
        """
        if not self.cookie:
            raise ValueError("COOKIE is required for DPMP API access.")
