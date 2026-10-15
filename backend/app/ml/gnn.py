"""The dual-mode GraphSAGE of gnn_location_model.ipynb (Section 2) and the graph it runs on.

Identical to the notebook and predict_poi.py; dropout is inactive at prediction time.
"""
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as Fn
from scipy.spatial import cKDTree
from torch_geometric.nn import GATv2Conv, GCNConv, MessagePassing
from torch_geometric.utils import softmax, to_undirected

from app.ml.features import K


class WSAGEConv(MessagePassing):
    """GraphSAGE layer with a weighted neighbour mean: lin_nbr(sum_j w_ji x_j) + lin_root(x_i)."""

    def __init__(self, d_in, d_out):
        super().__init__(aggr="add")
        self.lin_nbr = nn.Linear(d_in, d_out)
        self.lin_root = nn.Linear(d_in, d_out, bias=False)

    def forward(self, x, edge_index, edge_weight):
        return self.lin_nbr(self.propagate(edge_index, x=x, w=edge_weight)) + self.lin_root(x)

    def message(self, x_j, w):
        return w.unsqueeze(1) * x_j


class GNN(nn.Module):
    def __init__(self, in_dim, n_classes, conv="sage", hidden=64, layers=2, heads=4, attn_dropout=0.1,
                 label_input=True, **_):
        super().__init__()
        self.conv_type, self.label_input = conv, label_input
        self.in_drop, self.drop = nn.Identity(), nn.Identity()
        self.enc = nn.Linear(in_dim + n_classes, hidden)
        self.enc_norm = nn.BatchNorm1d(hidden)
        self.convs, self.norms = nn.ModuleList(), nn.ModuleList()
        for _ in range(layers):
            if conv == "sage":
                self.convs.append(WSAGEConv(hidden, hidden))
            elif conv == "gcn":
                self.convs.append(GCNConv(hidden, hidden, add_self_loops=True, normalize=True))
            else:
                self.convs.append(GATv2Conv(hidden, hidden // heads, heads=heads, concat=True, dropout=attn_dropout,
                                            add_self_loops=True, edge_dim=1))
            self.norms.append(nn.BatchNorm1d(hidden))
        self.head = nn.Linear(hidden * (layers + 1), n_classes)

    def _conv(self, conv, h, g):
        if self.conv_type == "sage":
            return conv(h, g["ei"], g["w"])
        if self.conv_type == "gcn":
            return conv(h, g["ei"], g["w_gcn"])
        return conv(h, g["ei"], g["ea"])

    def forward(self, x, g, label_onehot):
        if not self.label_input:
            label_onehot = torch.zeros_like(label_onehot)
        h = Fn.relu(self.enc_norm(self.enc(torch.cat([x, label_onehot], dim=1))))
        hs = [h]
        for conv, norm in zip(self.convs, self.norms):
            h = h + Fn.relu(norm(self._conv(conv, h, g)))
            hs.append(h)
        return self.head(torch.cat(hs, dim=1))


def undirected_knn(XY):
    """k = 8 nearest-neighbour graph, undirected, self excluded (as in the notebook)."""
    n = len(XY)
    _, nn_i = cKDTree(XY).query(XY, k=K + 2)
    nn_i = nn_i[nn_i != np.arange(n)[:, None]].reshape(n, K + 1)[:, :K]
    return to_undirected(torch.tensor(np.vstack([np.repeat(np.arange(n), K), nn_i.ravel()])), num_nodes=n)


def graph_tensors(edge_index, XY, dist_scale, logd_stats):
    """Edge weights of the model: softmax(-d / dist_scale) over each node's incoming edges (plain mean if None)."""
    n = len(XY)
    src, dst = edge_index
    d = torch.tensor(np.hypot(*(XY[src.numpy()] - XY[dst.numpy()]).T), dtype=torch.float32)
    deg = torch.bincount(dst, minlength=n).float()
    w = 1.0 / deg[dst] if dist_scale is None else softmax(-d / dist_scale, dst, num_nodes=n)
    ea = ((torch.log1p(d) - logd_stats[0]) / logd_stats[1]).unsqueeze(1)
    return {"ei": edge_index, "w": w, "w_gcn": w * deg[dst], "ea": ea}
