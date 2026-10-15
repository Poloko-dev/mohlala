"""Read-only views of the data and the model: the mapped POIs, the sub-districts and the evaluation metrics."""
from app.ml.predictor import MODES, Predictor
from app.schemas.model import ClassMetrics, FeatureImportance, ModelInfo, ModeSummary, NeighbourInfluence
from app.schemas.pois import Area, PoiPoint, PoiSummary
from app.services.presenters import poi_summary


def all_pois(pred: Predictor) -> list[PoiPoint]:
    cols = pred.base[["node_id", "lat", "lon", "category", "name"]]
    return [PoiPoint(**{**r, "name": r["name"] if isinstance(r["name"], str) else None})
            for r in cols.to_dict("records")]


def search_pois(pred: Predictor, query: str, limit: int) -> list[PoiSummary]:
    return [poi_summary(pred, i) for i in pred.find(query)[:limit]]


def areas(pred: Predictor) -> list[Area]:
    g = pred.base.groupby("adm2_pcode", sort=True)
    df = g.agg(sub_district=("adm2_name", "first"), adm1_pcode=("adm1_pcode", "first"),
               district=("adm1_name", "first"), lat=("lat", "mean"), lon=("lon", "mean"), pois=("node_id", "size"))
    return [Area(adm2_pcode=code, **r) for code, r in df.to_dict("index").items()]


def model_info(pred: Predictor) -> ModelInfo:
    m = pred.metrics
    final = m["final"]
    fold_stats = {r["test fold"]: r for r in final["per_fold"] if isinstance(r["test fold"], str)}
    pooled = {r["mode"]: r for r in final["pooled"]}
    summary = [ModeSummary(mode=md, macro_f1=fold_stats["mean"][f"F1 {md}"], macro_f1_sd=fold_stats["SD"][f"F1 {md}"],
                           accuracy=pooled[md]["accuracy"], top2=pooled[md]["top-2"], top3=pooled[md]["top-3"],
                           ece=pooled[md]["ECE scaled"], log_loss=pooled[md]["log loss scaled"])
               for md in ("known", "site")]
    per_class = {md: [ClassMetrics(category=r["index"], precision=r["precision"], recall=r["recall"], f1=r["F1"],
                                   top3=r["top-3"]) for r in final["per_class"][md]] for md in MODES}
    infl = m["ro2_neighbour_influence_pp"]
    influence = NeighbourInfluence(neighbour_categories=[r["index"].removesuffix(" known") for r in infl],
                                   predicted_categories=list(pred.classes),
                                   values_pp=[[r[c] for c in pred.classes] for r in infl])
    return ModelInfo(
        architecture=m["selected_architecture"], n_models=pred.n_models, n_features=len(pred.feats), n_pois=pred.n,
        n_labelled=int(pred.labelled.sum()), categories=list(pred.classes), own_attributes=pred.own_cols,
        config=m["selected_config"], summary=summary, per_class=per_class, per_fold=final["per_fold"],
        architecture_comparison=m["architecture_comparison"], ablations=m["ablations"],
        permutation_importance=[FeatureImportance(unit=r["unit"], d_log_loss=r["d_log_loss"], sd=r["sd"],
                                                  d_f1=r["d_F1"]) for r in m["ro2_permutation_importance"]],
        neighbour_influence=influence, site_f1_deployment=m["ro2_site_f1_deployment"],
        prior_factors=m["ro3_prior_factors"])
