
from flask import Flask

app = Flask(__name__)

@app.route('/profile')
def my_profile():
    response_body = {
        "name" : "Cary Bengals",
        "about" : "Cary Bengals Fantasy Football Website"
    }

    return response_body


if __name__ == '__main__':
    app.run()