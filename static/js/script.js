// Audio player setup

var buf = null;

//create AudioContext
var context = new AudioContext;

//load and decode wav file
function loadFile(url) { 
    var request = new XMLHttpRequest(); 
    request.open("GET", url, true); 
    request.responseType = "arraybuffer"; 
    request.onload = function() { 
        //decode the loaded data 
        context.decodeAudioData(request.response, function(buffer) { 
            buf = buffer;
            // call playSound() once buffer is loaded
            playSound();
        }); 
    }; 
    request.send(); 
} 

//play the loaded file 
function playSound() { 
    //create a source node from the buffer 
    var src = context.createBufferSource();  
    src.buffer = buf; 
    //connect to the final output node (the speakers) 
    src.connect(context.destination); 
    //play immediately 
    src.start(0); 
} 


// Recorder setup (using Recorder.js)

var recorder;
var userRecUrl;
var userBlob;

function startUserMedia(stream) {
  var input = context.createMediaStreamSource(stream);
  recorder = new Recorder(input);
}

window.onload = function init() {
  navigator.getUserMedia = ( navigator.getUserMedia ||
                       navigator.webkitGetUserMedia ||
                       navigator.mozGetUserMedia ||
                       navigator.msGetUserMedia);
  navigator.getUserMedia({audio: true}, startUserMedia, function(e) {
      console.log('Error: ', e);
    });
};

// create object url for blob when exportWAV is called
function myCallback(blob) {
  userRecUrl = (window.URL || window.webkitURL).createObjectURL(blob);
  userBlob = blob;
}

// change buttons & trigger animation when user clicks record button
function handleRecord(exID, recLength) {
  if ($('.record.'+exID).html() == '<span class="glyphicon glyphicon-record"></span> Record') {
    startRecord(exID, recLength);
    setTimeout(function () { 
      stopRecord(exID); 
    }, (recLength*1000));
  } else {
    stopRecord(exID);
    playBar.remove();
  }
};

function startRecord(exID, recLength) {
  recorder.clear();
  recorder.record();
  $('.record.'+exID).html('<span class="glyphicon glyphicon-stop"></span> Stop');
  animatePlaybar(recLength);
}

function stopRecord(exID) {
  recorder.stop();
  recorder.exportWAV(myCallback);
  $('.record.'+exID).html('<span class="glyphicon glyphicon-record"></span> Record');
  $('.analyze.'+exID).removeAttr('disabled');
  $('.play-back.'+exID).removeAttr('disabled');
}


var targetPitchData;

// send user's recording & sentence id to server, assign pitch data from response to variables, build graph
function showUserPitch(blob, targetPitchData, exID) {
    $('.loading.'+exID).show();
  var reader = new FileReader();
  // this is triggered once the blob is read and readAsDataURL returns
  reader.onload = function (event) {
    var formData = new FormData();
    formData.append('user_rec', event.target.result);
    formData.append('ex_id', exID);
    $.ajax({
      type: "POST",
      url: '/analyze',
      data: formData, 
      processData: false,
      contentType: false,
      dataType: 'json',
      cache: false,
      success: function(response) {
        userPitchData = JSON.parse(response['user_pitch_data']);
        userAudioData = JSON.parse(response['user_audio_data']);
        recID = JSON.parse(response['rec_id'])

        // add a play button for user's new recording
        if (!($('.attempts').html().trim())) {
          attemptNum = 1;
        } else {
          attemptNum = parseInt($('.attempts button:last-of-type').attr("class").split(' ')[3]) + 1;
        };
        addAttemptPlayBtn(attemptNum, recID, userAudioData);

        // add new recording's pitch data to graph
        updateGraph(userPitchData, attemptNum);
      }
    });
  }
  reader.readAsDataURL(blob);

  recorder.clear();
};


// build graph with NVD3
function buildGraph(recLength) {
  //console.log("chartData:", chartData);
  nv.addGraph(function() {
    chart = nv.models.lineChart()
      .useInteractiveGuideline(true)
      .interpolate("basis")
      .xDomain([0, recLength]);      
    
    chart.xAxis
      .axisLabel('Time (s)')
      .tickFormat(d3.format(',.1f'));
    
    chart.yAxis
      .axisLabel('Pitch (Hz)')
      .tickFormat(d3.format(',d'));
    
    d3.select('.chart.'+exID+' svg')
      .datum(chartData)
      .transition().duration(500)
      .call(chart);
    
    nv.utils.windowResize(chart.update);
    
    return chart;
  });
}

// add user's pitch data to graph
function updateGraph(userPitchData, attemptNum) {
  chartData.push({
    values: userPitchData,
    key: 'Recording #'+attemptNum
  })
  
  d3.select('.chart.'+exID+' svg')
    .datum(chartData)
    .transition().duration(500);
    
    chart.update();
    $('.loading').hide();
}

var playBar;

function animatePlaybar(recLength) {
  // create playbar
  var svg = d3.selectAll(".chart svg");
  playBar = svg.append("line")
    .attr("x1", 60)
    .attr("y1", 20)
    .attr("x2", 60)
    .attr("y2", 500)
    .attr("stroke-width", 1)
    .attr("stroke", "black");
  // animate playbar
  playBar.transition()
    .attr("x1", 900)   // width of graph
    .attr("x2", 900)
    .duration(recLength*1000)
    .ease("linear")
    .transition()
      .delay(recLength*1000)
      .duration(200)
      .remove();
}

// turn audio data from database (saved as dataurl) back into a blob so it can be played
function dataURItoBlob(dataURI) {
    // convert base64/URLEncoded data component to raw binary data held in a string
    var byteString;
    if (dataURI.split(',')[0].indexOf('base64') >= 0) {
        byteString = atob(dataURI.split(',')[1]);
    } else {
        byteString = unescape(dataURI.split(',')[1]);
    }
    // separate out the mime component
    var mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];

    // write the bytes of the string to a typed array
    var ia = new Uint8Array(byteString.length);
    for (var i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ia], {type:mimeString});
}


// initialize variables that will be reassigned each time a tab is shown
var exID;
var recLength;
var attempts;
var chart;
var chartData;

// get target pitch data from server & build graph (will be called each time a tab is shown)
function loadTab(exID, recLength) {
  $.post('/targetdata', { sentence: exID }, function (response) {
    targetPitchData = JSON.parse(response['target']);
    attempts = response['attempts'];
    chartData = [
      {
        values: targetPitchData,
        key: 'Target intonation'
      }
    ];
    buildGraph(recLength);
    $('.chart').show();
    // empty out .attempts div and then populate it with buttons
    $('.attempts').empty();
    for (i = 0; i < attempts.length; i++) {
      addAttemptPlayBtn(attempts[i]['attempt_num'], attempts[i]['rec_id'], attempts[i]['audio_data']);
    };
    // $('.attempts').show();
    // if there are attempts saved, add their pitch data to the graph
    if (attempts.length > 0) {
      for (i = 0; i < attempts.length; i++) {
        chartData.push({
          values: JSON.parse(attempts[i]['pitch_data']),
          key: 'Recording #'+attempts[i]['attempt_num']
        });
      }
    }
  });
}

// add a play button for each recording the user has already made for this sentence
function addAttemptPlayBtn(attemptNum, recID, attemptDataUrl) {
  newPlayBtn = $('<button>').attr('class', 'btn btn-primary play-attempt '+attemptNum+' '+recID+' btn-sm')
    .html('<span class="glyphicon glyphicon-play"></span> Play')
    .on('click', function (evt) {
      var attemptBlob = dataURItoBlob("data:audio/wav;base64,"+attemptDataUrl);
      var attemptObjUrl = (window.URL || window.webkitURL).createObjectURL(attemptBlob);
      loadFile(attemptObjUrl);
      animatePlaybar(recLength);
    });
  newDelBtn = $('<button>').attr('class', 'btn btn-danger del-attempt '+attemptNum +' '+recID+' btn-sm')
    .html('<span class="glyphicon glyphicon-remove"></span> Delete')
    .on('click', function (evt) {
      recID = $(this).attr("class").split(' ')[4];
      $.post('/delete-attempt', { rec_id: recID }, function () {
        loadTab(exID, recLength);
      });
    });
  $('.attempts').append('<b>#'+attemptNum+'</b> ', newPlayBtn, ' ', newDelBtn, '<br><br>');
}

function switchTabs(exID, recLength) {
  $('.chart.'+exID).hide();
  loadTab(exID, recLength);
}


// when page loads:
$(document).ready(function () {
  $('#tabs').tab();
  $('.loading').hide();
  
  // disable playback & compare buttons until user has recorded in that tab
  $('.play-back').attr('disabled','disabled');
  $('.analyze').attr('disabled','disabled');

  // when play button is pressed, play sample sentence & animate play bar across graph
  $('.play').on('click', function (evt) {
    loadFile("/sounds/"+exID+".wav");
    animatePlaybar(recLength);
  });

  // for play buttons in overview tab, retrieve exID from classes & play that file
  $('.ov-play').on('click', function (evt) {
    exID = $(this).attr("class").split(' ')[3];
    loadFile("/sounds/"+exID+".wav");
  });

  // when playback button is pressed, play user's recording
  $('.play-back').on('click', function (evt) {
    loadFile(userRecUrl);
    animatePlaybar(recLength);
  });

  // when Record/Stop button is pressed
  $('.record').on('click', function (evt) {
    handleRecord(exID, recLength);
  });

  // when Compare button is pressed, analyze user's recording & show graph
  $('.analyze').on('click', function (evt) {
    showUserPitch(userBlob, targetPitchData, exID);
    $('.play-back').attr('disabled','disabled');
    $('.analyze').attr('disabled','disabled');
  });
});

$(document).on('hidden.bs.tab', 'a[data-toggle="tab"]', function (e) {
  // re-disable playback & compare buttons when user navigates away from tab
  $('.play-back').attr('disabled','disabled');
  $('.analyze').attr('disabled','disabled'); 
});

