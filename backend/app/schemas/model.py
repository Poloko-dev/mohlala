from typing import Any

from pydantic import Field

from app.schemas.common import Mode, Schema

Table = list[dict[str, Any]]


class ModeSummary(Schema):
    mode: Mode
    macro_f1: float = Field(description="Test macro-F1, mean over the 5 spatial folds")
    macro_f1_sd: float = Field(description="SD of the test macro-F1 over the folds")
    accuracy: float
    top2: float
    top3: float
    ece: float = Field(description="Expected calibration error after temperature scaling")
    log_loss: float


class ClassMetrics(Schema):
    category: str
    precision: float
    recall: float
    f1: float
    top3: float


class FeatureImportance(Schema):
    unit: str = Field(description="A feature, or a group of features ('group: loc_')")
    d_log_loss: float = Field(description="Rise in log loss when the unit is shuffled")
    sd: float
    d_f1: float


class NeighbourInfluence(Schema):
    """Change in each predicted probability (percentage points) when the categories of all neighbours of one type
    are hidden, for held-out nodes with such a neighbour (site mode)."""

    neighbour_categories: list[str]
    predicted_categories: list[str]
    values_pp: list[list[float]]


class ModelInfo(Schema):
    architecture: str
    n_models: int
    n_features: int
    n_pois: int
    n_labelled: int
    categories: list[str]
    own_attributes: list[str] = Field(description="Inputs hidden in site mode: how the POI itself is mapped")
    config: dict[str, Any]
    summary: list[ModeSummary]
    per_class: dict[Mode, list[ClassMetrics]]
    per_fold: Table
    architecture_comparison: Table
    ablations: Table
    permutation_importance: list[FeatureImportance]
    neighbour_influence: NeighbourInfluence
    site_f1_deployment: float
    prior_factors: dict[str, float]
