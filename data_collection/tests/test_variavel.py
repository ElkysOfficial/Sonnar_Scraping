"""Testes para o sistema de batching de stacks (variavel.py)."""
import pytest

from variavel import (
    STACK_CATEGORIES,
    get_active_stacks,
    iter_batches,
    set_active_batch,
    stacks,
)


@pytest.fixture(autouse=True)
def reset_active_batch():
    """Garante que cada teste comece com batching desativado."""
    set_active_batch(None)
    yield
    set_active_batch(None)


class TestStackCatalog:
    def test_stacks_set_is_union_of_categories(self):
        union = {s for items in STACK_CATEGORIES.values() for s in items}
        assert stacks == union

    def test_categories_are_non_empty(self):
        for category, items in STACK_CATEGORIES.items():
            assert items, f"Categoria '{category}' está vazia"

    def test_category_count(self):
        assert len(STACK_CATEGORIES) == 15


class TestIterBatches:
    def test_default_batch_size(self):
        batches = list(iter_batches())
        # batch_size padrão = 5; cada lote tem no máximo 5 itens
        for cat, batch in batches:
            assert 1 <= len(batch) <= 5

    def test_respects_category_boundaries(self):
        """Nenhum lote deve misturar stacks de categorias diferentes."""
        for category, batch in iter_batches(10):
            assert set(batch).issubset(set(STACK_CATEGORIES[category]))

    def test_covers_all_stacks(self):
        emitted = set()
        for _, batch in iter_batches(10):
            emitted.update(batch)
        assert emitted == stacks

    def test_no_duplicates_across_batches(self):
        all_emitted = []
        for _, batch in iter_batches(10):
            all_emitted.extend(batch)
        assert len(all_emitted) == len(set(all_emitted))

    @pytest.mark.parametrize("size", [1, 3, 5, 10, 50])
    def test_batch_size_parametrized(self, size):
        for _, batch in iter_batches(size):
            assert 1 <= len(batch) <= size

    def test_invalid_batch_size_raises(self):
        with pytest.raises(ValueError):
            list(iter_batches(0))
        with pytest.raises(ValueError):
            list(iter_batches(-5))

    def test_batches_preserve_category_order(self):
        emitted_categories = []
        for cat, _ in iter_batches(10):
            if not emitted_categories or emitted_categories[-1] != cat:
                emitted_categories.append(cat)
        assert emitted_categories == list(STACK_CATEGORIES.keys())


class TestActiveBatch:
    def test_default_returns_full_set(self):
        assert get_active_stacks() == stacks

    def test_set_and_get(self):
        set_active_batch(["Python", "Java"])
        assert get_active_stacks() == {"Python", "Java"}

    def test_reset_via_none(self):
        set_active_batch(["Python"])
        set_active_batch(None)
        assert get_active_stacks() == stacks

    def test_set_active_batch_copies_input(self):
        # Mutações na lista original não devem afetar o lote ativo
        original = ["Python", "Java"]
        set_active_batch(original)
        original.append("Go")
        assert "Go" not in get_active_stacks()
