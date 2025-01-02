from flask import Blueprint

profile = Blueprint('profile', __name__)

@profile.route('/info')
def retrieve_profile():
    response_body = {
        "name": "Cary Bengals",
        "about": "Cary Bengals Fantasy Football Website"
    }
    return response_body