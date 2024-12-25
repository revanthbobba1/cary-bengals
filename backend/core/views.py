from core import app

@app.route('/info')
def cary_bengals_info():
    response_body = {
        "name": "Cary Bengals",
        "about" :"Welcome to the Cary Bengals Fantasy Football page"
    }

    return response_body