import warnings

# torch_geometric imports torch.jit.script, which warns on Python 3.14; the model does not use it
warnings.filterwarnings("ignore", message=".*torch.jit.script.*")
