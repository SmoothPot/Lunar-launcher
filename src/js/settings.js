slider = document.getElementById("settings-memory");
label = document.getElementById("settings-memory-value");

slider.oninput = function() {
  label.innerHTML = (parseFloat(this.value) / 1024).toFixed(1) + " GB";
}
