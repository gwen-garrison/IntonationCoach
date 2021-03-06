"""Server for Intonation Coach."""

from flask import Flask, render_template, session, send_from_directory, request, jsonify, flash, redirect, url_for, Response
from flask_debugtoolbar import DebugToolbarExtension
import jinja2
import json
import base64
from os import path

from model import Recording, connect_to_db, db
from pitchgraph import praat_analyze_pitch, format_pitch_data


app = Flask(__name__)

app.secret_key = 'development key'

app.jinja_env.undefined = jinja2.StrictUndefined

response = Response()

@app.route('/')
def index():
	"""Homepage. User will choose language here."""

	return render_template("home.html")


@app.route('/about')
def about():
	"""Show the about page."""

	return render_template("about.html")


@app.route('/guidelines')
def guidelines():
	"""Show guidelines page."""

	return render_template("guidelines.html")

@app.route('/french')
def french_content():
	"""Display explanation text and sample sentences, with play buttons for sample recordings."""

	return render_template("french.html")


@app.route('/english-us')
def english_content():
	"""Display US English page."""

	return render_template('english-us.html')


@app.route('/russian')
def russian_content():
	"""Display Russian page."""

	target_pitch_data = format_pitch_data(praat_analyze_pitch(path.abspath("./static/sounds/en-us-1.wav")))

	target_json = jsonify(target_pitch_data=target_pitch_data)
	return render_template('russian.html', target_json=target_json)


@app.route('/<path:path>')
def send_audio_file(path):
	"""Given a url of an audio file, return that file as stored in static folder."""

	return send_from_directory('static', path)


@app.route('/targetdata', methods=["POST"])
def send_target_pitch_data():
	"""Sends pitch data from target recording to be displayed in graph when tab loads. Also sends the user's past attempts at this sentence, if any."""

	ex_id = request.form.get("sentence")
	target_filepath = "./static/json/" + ex_id + "-pd.json"
	target_file = open(target_filepath)
	target_json = json.loads(target_file.read())
	target_pitch_data = json.dumps(target_json, sort_keys=True)		# target_pitch_data is a str
	target_file.close()

	attempts = Recording.query.filter_by(ex_id=ex_id).all()
	if not attempts:
		attempts = []
	attempts_serialized = [attempt.serialize() for attempt in attempts]		# attempts_serialized is a list

	return jsonify(target=target_pitch_data, attempts=attempts_serialized)


@app.route('/analyze', methods=["POST"])
def analyze_user_rec():
	"""Analyze the user's recording, save the audio data and pitch data to database, and send pitch data back to page."""

	# analyze user's recording:
	user_b64 = request.form.get("user_rec")[22:]		# cut off first 22 chars ("data:audio/wav;base64,")

	user_wav = base64.b64decode(user_b64)
	f = open('./static/sounds/user-rec.wav', 'wb')
	f.write(user_wav)
	f.close()
	user_rec_filepath = path.abspath('./static/sounds/user-rec.wav')

	user_pitch_data = format_pitch_data(praat_analyze_pitch(user_rec_filepath))

	# store audio data (user_b64) and user_pitch_data in db
	ex_id = request.form.get("ex_id")
	attempts = Recording.query.filter_by(ex_id=ex_id).all()		# list of recording objects
	if attempts:
		attempt_nums = []
		for attempt in attempts:
			attempt_nums.append(attempt.attempt_num)
		next_attempt_num = 1 + max(attempt_nums)
	else:
		next_attempt_num = 1

	new_rec = Recording(ex_id=ex_id, attempt_num=next_attempt_num, audio_data=user_b64, pitch_data=user_pitch_data)
	db.session.add(new_rec)
	db.session.commit()

	user_audio_data=json.dumps(user_b64)

	rec_id = new_rec.rec_id

	return jsonify(user_pitch_data=user_pitch_data, user_audio_data=user_audio_data, rec_id=rec_id)


@app.route('/delete-attempt', methods=["POST"])
def delete_attempt():
	"""Given the recording id of a user's attempt, delete that recording from the database."""

	rec_id = request.form.get("rec_id")
	rec = Recording.query.filter_by(rec_id=rec_id).one()
	db.session.delete(rec)
	db.session.commit()

	current_url = redirect_url()
	return redirect(current_url)




######### Helper functions ##############

def redirect_url(default='index'):
    return request.args.get('next') or \
           request.referrer or \
           url_for(default)




if __name__ == "__main__":
	app.debug = True
	connect_to_db(app)

	# DebugToolbarExtension(app)
	app.run()
