from flask import Blueprint

errors = Blueprint('errors', __name__)

@errors.app_errorhandler(404)
def not_found_error(error):
    return {
        "error": "Not Found",
        "message": "The requested resource was not found"
    }, 404

@errors.app_errorhandler(500)
def internal_error(error):
    return {
        "error": "Internal Server Error",
        "message": "An unexpected error has occurred"
    }, 500