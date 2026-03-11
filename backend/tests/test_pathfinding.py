from app.movement.collision_grid import CollisionGrid, NavNode
from app.movement.pathfinding import AStarPathfinder


def test_find_path_handles_equal_priority_neighbors() -> None:
    grid = CollisionGrid(width=3, height=3)

    path = AStarPathfinder.find_path(
        grid,
        NavNode(0, 0),
        NavNode(2, 2),
        allow_diagonal=False,
    )

    assert path
    assert path[0] == NavNode(0, 0)
    assert path[-1] == NavNode(2, 2)
    assert len(path) == 5