import sys
from pathlib import Path
from types import SimpleNamespace

import networkx as nx
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from app import model_config, retriever


@pytest.fixture
def retrieval(monkeypatch):
    class Vector(list):
        def tolist(self):
            return list(self)
    monkeypatch.setattr(retriever, 'get_embedding_model', lambda: SimpleNamespace(
        encode=lambda queries: [Vector([1.0, 0.0])]))
    calls = []
    monkeypatch.setattr(retriever, 'get_reranker_model', lambda: SimpleNamespace(
        predict=lambda pairs: calls.extend(pairs) or [1.0] * len(pairs)))
    collection = SimpleNamespace(query=lambda **kwargs: {'ids': [['seed']]})
    graph = nx.DiGraph()
    for name, doc in [('seed', 'a'), ('table', 'a'), ('foreign', 'b'), ('beyond', 'a')]:
        graph.add_node(name, doc_id=doc, content=name, element_type='TextElement', page_number=1)
    graph.add_edges_from([('seed', 'table'), ('table', 'foreign'), ('foreign', 'beyond')])
    return collection, graph, calls


def test_document_scope_applies_to_graph_walk_and_reranking(retrieval):
    collection, graph, calls = retrieval
    context = retriever.retrieve_context('question', collection, graph, doc_id='a')
    assert 'seed' in context and 'table' in context
    assert 'foreign' not in context and 'beyond' not in context
    assert {text for _, text in calls} == {'seed', 'table'}


def test_global_mode_keeps_cross_document_context(retrieval):
    collection, graph, _ = retrieval
    assert 'foreign' in retriever.retrieve_context('question', collection, graph, doc_id='global')


def test_equal_scores_have_stable_order(retrieval):
    collection, graph, _ = retrieval
    graph.remove_node('foreign')
    context = retriever.retrieve_context('question', collection, graph, doc_id='a')
    assert context.index('[ID: seed') < context.index('[ID: table')


def test_foreign_seed_is_rejected(retrieval):
    collection, graph, calls = retrieval
    graph.nodes['seed']['doc_id'] = 'b'
    assert retriever.retrieve_context('question', collection, graph, doc_id='a') == ''
    assert calls == []


def test_vision_failure_cannot_invent_numbers(monkeypatch):
    monkeypatch.setattr(model_config, 'get_vlm_models', lambda: (_ for _ in ()).throw(RuntimeError('offline')))
    assert model_config.generate_image_description('missing.png') == 'Image description unavailable.'


def test_missing_vision_model_is_explicit(monkeypatch):
    monkeypatch.setattr(model_config, 'get_vlm_models', lambda: (None, None))
    assert model_config.generate_image_description('missing.png') == 'Image description unavailable.'


def test_failed_vector_search_returns_no_context(retrieval):
    collection, graph, calls = retrieval
    def fail(**kwargs):
        raise RuntimeError('database unavailable')
    collection.query = fail
    assert retriever.retrieve_context('question', collection, graph, doc_id='a') == ''
    assert calls == []


def test_vision_inference_failure_cleans_temporary_image(monkeypatch, tmp_path):
    paths = []
    class Image:
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def thumbnail(self, size): pass
        def convert(self, mode): return self
        def save(self, path, **kwargs):
            Path(path).write_bytes(b'test image')
            paths.append(Path(path))
    monkeypatch.setitem(sys.modules, 'PIL', SimpleNamespace(Image=SimpleNamespace(open=lambda _: Image())))
    def fail(*args, **kwargs):
        raise RuntimeError('generation failed')
    monkeypatch.setitem(sys.modules, 'mlx_vlm', SimpleNamespace(generate=fail))
    monkeypatch.setattr(model_config, 'get_vlm_models', lambda: (object(), SimpleNamespace(
        apply_chat_template=lambda *a, **k: 'prompt')))
    assert model_config.generate_image_description('image.png') == 'Image description unavailable.'
    assert len(paths) == 1 and not paths[0].exists()


def test_vision_success_preserves_observed_text(monkeypatch):
    class Image:
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def thumbnail(self, size): pass
        def convert(self, mode): return self
        def save(self, path, **kwargs): Path(path).write_bytes(b'image')
    monkeypatch.setitem(sys.modules, 'PIL', SimpleNamespace(Image=SimpleNamespace(open=lambda _: Image())))
    monkeypatch.setitem(sys.modules, 'mlx_vlm', SimpleNamespace(generate=lambda *a, **k: SimpleNamespace(text='  observed chart values  ')))
    monkeypatch.setattr(model_config, 'get_vlm_models', lambda: (object(), SimpleNamespace(
        apply_chat_template=lambda *a, **k: 'prompt')))
    assert model_config.generate_image_description('image.png') == 'observed chart values'
