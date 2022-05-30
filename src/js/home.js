const app = require('electron').remote;
const { shell } = require('electron')
const aal = require('./aal.js');
const fs = require('fs');
const request = require('request');
const { machineIdSync } = require('node-machine-id');
const log = require('electron-log');

hwid = machineIdSync();
launchButton = document.querySelector('.launch-button');
launchText = document.querySelector('.launch-text');
launchState = 'no_access';
log.transports.file.level = "info";

function setLaunchState(state) {
  if (state === 'no_access') {
    launchText.innerHTML = 'No Access';
    launchButton.src = 'images/launch/no_auth.png';
  } else if (state === 'ready') {
    launchText.innerHTML = 'Launch Client';
    launchButton.src = 'images/launch/ready.png';
  } else if (state === 'authenticating') {
    launchText.innerHTML = 'Authenticating...';
    launchButton.src = 'images/launch/loading.png';
  } else if (state === 'connecting') {
    launchText.innerHTML = 'Connecting...';
    launchButton.src = 'images/launch/loading.png';
  } else if (state === 'launching') {
    launchText.innerHTML = 'Launching...';
    launchButton.src = 'images/launch/loading.png';
  } else {
    launchText.innerHTML = 'Error';
    launchButton.src = '';
  }

  launchState = state;
}

let launchClient = () => {
  if (launchState != 'ready') {
      return;
  }

  log.info("[LC] Launching...");
  setLaunchState('authenticating');

  try {
    let sliderValue = document.getElementById("settings-memory").value;
    fs.writeFileSync('C:\\AlphaAntiLeak\\AAL.config.json', JSON.stringify({heap: parseInt(sliderValue, 10)}));
  } catch (err) {
    console.log(err);
  }

  log.info("[LC] Wrote settings to filesystem...");

  request.post({
    url: 'https://clientdownload.lunar.gg/api/launcher/launch',
    headers: {
      'User-Agent': 'Lunar Client Launcher'
    },
    body: JSON.stringify({
      token: hwid,
      version: app.app.getVersion()
    })
  }, function(error, response, body) {
    log.info("[LC] Received server auth...");
    body = JSON.parse(body);

    if (!body.access) {
      console.log('No access');
      return;
    }

    log.info("[LC] Invoking launchApp...");
    setLaunchState('connecting');

    aal.launchApp(
      body.app_id,
      body.auth,
      [],
      e => {
        console.log(e);
      },
      done => {
        log.info('[DONE] Exited with status code ' + done);

        setLaunchState('ready');
        app.getCurrentWindow().show();

        request.post({
          url: 'https://clientdownload.lunar.gg/api/launcher/close',
          headers: {
            'User-Agent': 'Lunar Client Launcher'
          },
          body: JSON.stringify({
            token: hwid,
          })
        }, function(error, response, body) {});
    },
    output => {
        if (output.includes("[OptiFine]")) {
          app.getCurrentWindow().hide();
        } else if (output === "AAL_STATUS_CONNECTED") {
          setLaunchState('launching');
        }

        // only log output to console
        console.log('[OUTPUT] ' + output);
    },
    process => {});
  });
};

launchButton.addEventListener('click', launchClient);
launchText.addEventListener('click', launchClient);

// POPULATE BLOG POST AREA //
console.log('[LC] Making meta request');
request.post({
  url: 'https://clientdownload.lunar.gg/api/launcher/meta',
  headers: {
    'User-Agent': 'Lunar Client Launcher'
  },
  body: JSON.stringify({
    token: hwid,
    version: app.app.getVersion()
  })
}, function(error, response, body) {
  console.log('[LC] Received meta response');
  body = JSON.parse(body);

  document.querySelector('.blog-title').innerHTML = body.latest_blog_post.title;
  document.querySelector('.blog-content').innerHTML = body.latest_blog_post.content.replace(/(?:\r\n|\r|\n)/g, '<br>');  // Replace newline char with <br>
  document.querySelector('.blog-author').innerHTML = 'Posted by ' + body.latest_blog_post.author;
  document.querySelector('.blog-author-skin').src = 'https://crafatar.com/avatars/' + body.latest_blog_post.author_uuid + '?size=32';

  let heap = 2048;

  try {
    let settingsRaw = fs.readFileSync('C:\\AlphaAntiLeak\\AAL.config.json');
    let settings = JSON.parse(settingsRaw);
    heap = settings.heap;
  } catch (ignore) {}

  memorySlider = document.querySelector('#settings-memory');
  memorySlider.value = heap;
  memorySlider.oninput();

  if (body.can_launch) {
    setLaunchState('ready');
  } else {
    setLaunchState('no_access');
  }

  app.getCurrentWindow().show();
});
