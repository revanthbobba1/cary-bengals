
from flask import Flask
from dotenv import load_dotenv
from routes.profile import profile
from routes.errors import errors


load_dotenv()

def create_app():
    app = Flask(__name__)
    
    # Register blueprints
    app.register_blueprint(profile)
    app.register_blueprint(errors)
    
    return app

app = create_app()

if __name__ == '__main__':
    app.run(debug=True)
    