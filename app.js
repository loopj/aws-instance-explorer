document.addEventListener("DOMContentLoaded", function(event) {
  // Create instance chart
  window.chart = new AwsInstanceChart(document.getElementById("chart"));

  // Activate settings inputs
  var settingsInputs = document.querySelectorAll("input[name='accessKeyId'], input[name='secretAccessKey'], input[name='colorBy'], input[name='groupBy']");
  for(let i = 0; i < settingsInputs.length; i++) {
    let input = settingsInputs[i];

    // Pre-fill inputs with stored data (if any)
    input.value = chart.settings[input.name];

    // Update chart when input contents change
    input.addEventListener("blur", (event) => {
      chart[input.name] = input.value;
    });
  }

  // Template function for instance nodes
  let instanceTemplate = (instance) => {
    var template = `
      <h2>Instance info</h2>
      <dl>
        <dt>Instance ID</dt>
        <dd>${instance.instanceId}</dd>

        <dt>Instance type</dt>
        <dd>${instance.instanceType}</dd>
      </dl>

      <h2>Tags</h2>
      <dl>`

    for(var tag in instance.tags) {
      template += `
        <dt>${tag}</dt>
        <dd>${instance.tags[tag]}</dd>`;
    }

    template += `</dl>`;
    return template;
  };

  // Template function for group nodes
  let groupTemplate = (node) => {
    var template = `
      <h2>Group Info</h2>
      <dl>
        <dt>Group Name</dt>
        <dd>${node.id}</dd>

        <dt>Children</dt>
        <dd>${node.children.length}</dd>
      </dl>`

    return template;
  };

  // Update info pane based on mouseover
  chart.handleMouseOver = (node) => {
    if(node.nodeType == "instance") {
      document.getElementById("instance-info").innerHTML = instanceTemplate(node);
    } else if(node.nodeType == "group") {
      document.getElementById("instance-info").innerHTML = groupTemplate(node);
    }
  };

  // Load instance data
  chart.loadInstanceData();
});
