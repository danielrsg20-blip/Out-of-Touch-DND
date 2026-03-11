from app.map_engine import GameMap, MapEntity
from app.movement.collision_grid import CollisionGrid
from app.movement.movement_validator import MovementValidator
from app.rules.characters import create_character
from app.rules.combat import CombatParticipant, CombatState


def build_open_map(width: int = 6, height: int = 4) -> GameMap:
    game_map = GameMap(width=width, height=height)
    for x in range(width):
        for y in range(height):
            game_map.set_tile(x, y, "floor")
    return game_map


def test_validate_move_request_uses_current_participant_character_id() -> None:
    game_map = build_open_map()
    entity = MapEntity(id="pc_1", name="Hero", x=1, y=1, entity_type="pc")
    game_map.entities[entity.id] = entity

    hero = create_character("pc_1", "Hero", "Human", "Fighter", {"STR": 15, "DEX": 14, "CON": 14})
    participant = CombatParticipant(character=hero, initiative=10, movement_remaining=30)
    combat = CombatState(participants=[participant], turn_index=0, round_number=1, is_active=True)

    grid = CollisionGrid(game_map.width, game_map.height)
    grid.build_from_map(game_map)

    result = MovementValidator.validate_move_request(
        entity=entity,
        target_x=5,
        target_y=1,
        collision_grid=grid,
        map_data=game_map,
        combat_state=combat,
        check_movement_pool=True,
    )

    assert result.valid is True
    assert result.distance_feet == 20


def test_validate_move_request_rejects_non_current_combatant() -> None:
    game_map = build_open_map()
    entity = MapEntity(id="pc_1", name="Hero", x=1, y=1, entity_type="pc")
    game_map.entities[entity.id] = entity

    current_hero = create_character("pc_2", "Other", "Human", "Fighter", {"STR": 15, "DEX": 14, "CON": 14})
    participant = CombatParticipant(character=current_hero, initiative=10, movement_remaining=30)
    combat = CombatState(participants=[participant], turn_index=0, round_number=1, is_active=True)

    grid = CollisionGrid(game_map.width, game_map.height)
    grid.build_from_map(game_map)

    result = MovementValidator.validate_move_request(
        entity=entity,
        target_x=2,
        target_y=1,
        collision_grid=grid,
        map_data=game_map,
        combat_state=combat,
        check_movement_pool=True,
    )

    assert result.valid is False
    assert result.error == "Not your turn"