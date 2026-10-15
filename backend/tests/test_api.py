import pytest

from tests.conftest import wait_for_job

API = "/api/v1"
MASERU = {"lat": -29.315, "lon": 27.487}


def test_health(client):
    assert client.get(f"{API}/health").json() == {"status": "ok", "models": 25, "pois": 6083}


def test_model_info(client):
    info = client.get(f"{API}/model").json()
    assert info["n_models"] == 25 and info["n_features"] == 66 and len(info["categories"]) == 8
    summary = {s["mode"]: s for s in info["summary"]}
    assert summary["known"]["macro_f1"] == pytest.approx(0.356, abs=1e-3)
    assert summary["site"]["macro_f1"] == pytest.approx(0.245, abs=1e-3)
    influence = info["neighbour_influence"]
    assert len(influence["values_pp"]) == len(influence["neighbour_categories"]) == 8


def test_site_prediction(client):
    r = client.post(f"{API}/predictions/site", json=MASERU)
    assert r.status_code == 200
    body = r.json()
    [site] = body["predictions"]
    probs = [s["probability"] for s in site["scores"]]
    assert site["mode"] == "site" and len(probs) == 8
    assert probs == sorted(probs, reverse=True) and sum(probs) == pytest.approx(1, abs=1e-4)
    assert body["context"]["adm2_pcode"] == "LSA12" and len(body["context"]["neighbours"]) == 8
    assert all(s["signal"] in ("gap", "cluster") for s in body["market_signals"])


@pytest.mark.parametrize("body", [{"lat": -25.0, "lon": 27.487}, {**MASERU, "adm2_pcode": "XX99"}])
def test_site_rejects_bad_input(client, body):
    r = client.post(f"{API}/predictions/site", json=body)
    assert r.status_code == 422 and isinstance(r.json()["detail"], str)


def test_new_poi_prediction(client):
    r = client.post(f"{API}/predictions/new-poi", json={**MASERU, "has_name": True, "has_hours": True,
                                                         "footprint_m2": 120})
    assert r.status_code == 200
    assert r.json()["predictions"][0]["mode"] == "known"


def test_existing_poi(client):
    hits = client.get(f"{API}/pois/search", params={"q": "node/11904634707"}).json()
    assert [h["node_id"] for h in hits] == [0]
    body = client.get(f"{API}/pois/0/prediction").json()
    assert {p["mode"] for p in body["predictions"]} == {"site", "known"}
    assert body["true_category"] == "Infrastructure" and body["poi"]["osm_id"] == "node/11904634707"
    assert client.get(f"{API}/pois/999999/prediction").status_code == 404


def test_pois_and_areas(client):
    pois = client.get(f"{API}/pois").json()
    assert len(pois) == 6083 and pois[0]["node_id"] == 0
    areas = client.get(f"{API}/areas").json()
    assert len(areas) == 78 and all(a["pois"] > 0 for a in areas)


def test_market_gaps(client):
    flagged = client.get(f"{API}/market-gaps").json()
    assert len(flagged) == 57 and all(g["signal"] for g in flagged)
    quthing = client.get(f"{API}/market-gaps", params={"area": "quthing", "flagged_only": False}).json()
    assert quthing and all("quthing" in (g["adm1_name"] + g["adm2_name"]).lower() for g in quthing)


def test_suggestion_job(client):
    r = client.post(f"{API}/suggestions", json={"category": "Retail", "lat": -30.4005, "lon": 27.7013,
                                                "radius_km": 0.5})
    assert r.status_code == 202 and r.headers["location"].endswith(r.json()["id"])
    job = wait_for_job(client, r.headers["location"])
    assert job["status"] == "succeeded"
    sites = job["result"]["sites"]
    assert len(sites) == job["progress"]["total"] > 0
    assert [s["probability"] for s in sites] == sorted((s["probability"] for s in sites), reverse=True)


@pytest.mark.parametrize("body", [{"category": "Casino", **MASERU}, {"category": "Retail", **MASERU, "radius_km": 10,
                                                                      "step_m": 50}])
def test_suggestion_rejects_bad_input(client, body):
    assert client.post(f"{API}/suggestions", json=body).status_code == 422


def test_batch_job(client):
    csv = "name,lat,lon\nA,-29.315,27.487\nB,-25,27.4\nC,oops,27.4\n"
    r = client.post(f"{API}/batch", files={"file": ("sites.csv", csv, "text/csv")}, data={"mode": "site"})
    assert r.status_code == 202
    job = wait_for_job(client, r.headers["location"])
    result = job["result"]
    assert job["status"] == "succeeded" and result["scored"] == 1 and result["failed"] == 2
    assert result["rows"][0]["pred_category"] and "outside Lesotho" in result["rows"][1]["error"]
    out = client.get(f"{r.headers['location']}/csv")
    assert out.headers["content-type"].startswith("text/csv")
    header = out.text.splitlines()[0]
    assert header.startswith("name,lat,lon,mode,pred_category,pred_prob,top3,p_Infrastructure")


def test_batch_rejects_csv_without_coordinates(client):
    r = client.post(f"{API}/batch", files={"file": ("x.csv", "a,b\n1,2\n", "text/csv")})
    assert r.status_code == 422 and "lat" in r.json()["detail"]


def test_unknown_job(client):
    assert client.get(f"{API}/suggestions/nope").status_code == 404
    assert client.get(f"{API}/batch/nope").status_code == 404
