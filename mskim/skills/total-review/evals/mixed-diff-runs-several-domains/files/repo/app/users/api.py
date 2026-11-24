from flask import Blueprint, g, jsonify, request

from app.auth import login_required
from app.db import get_db

bp = Blueprint("users", __name__)


@bp.get("/me")
@login_required
def me():
    return jsonify(id=g.user.id, name=g.user.name)


@bp.get("/users/search")
@login_required
def search():
    q = request.args.get("q", "")
    rows = get_db().execute(f"SELECT id, name FROM users WHERE name LIKE '%{q}%'").fetchall()
    return jsonify([dict(r) for r in rows])
