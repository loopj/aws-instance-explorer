class AwsInstanceChart {
  constructor(el) {
    var width = el.offsetWidth;
    var height = el.offsetHeight;

    // Configure AWS SDK
    AWS.config.region = 'us-east-1';

    // Node data
    this.nodes = [];

    // D3 force-directed graph layout
    this.force = d3.layout.force()
      .size([width, height])
      .linkDistance(30)
      .charge(-200)
      .on("tick", () => { this.tick() });

    // SVG canvas
    this.svg = d3.select(el).append("svg")
      .attr("width", width)
      .attr("height", height);

    // Node color palette
    this.fill = d3.scale.category20();
  }

  setCredentials(accessKeyId, secretAccessKey) {
    AWS.config.update({accessKeyId: accessKeyId, secretAccessKey: secretAccessKey});
  }

  update() {
    var links = d3.layout.tree().links(this.nodes);

    // Update nodes and links
    this.force
      .nodes(this.nodes)
      .links(links)
      .start();

    // Fade in SVG canvas
    this.svg.style("opacity", 1e-6)
      .transition()
        .duration(5000)
        .style("opacity", 1);

    // Draw nodes
    var node = this.svg.selectAll(".node")
      .data(this.nodes)
      .enter().append("g")
        .attr("class", "node")
        .call(this.force.drag);

    // Draw circles
    var circle = node.append("circle")
      .attr("r", (d) => { return d.children ? 2 : 6; } )
      .style("fill", (d) => { return this.fill(d.role); })
      .style("stroke", (d) => { return d3.rgb(this.fill(d.role)).darker(2); });

    // Draw labels
    var label = node.append("text")
      .attr("dy", ".35em")
      .text(function(d) { return d.name; });

    // Draw links
    var link = this.svg.selectAll(".link")
      .data(links)
      .enter().insert("line", ".node")
        .attr("class", "link");
  }

  tick() {
    // Reposition links
    this.svg.selectAll(".link")
      .attr("x1", function(d) { return d.source.x; })
      .attr("y1", function(d) { return d.source.y; })
      .attr("x2", function(d) { return d.target.x; })
      .attr("y2", function(d) { return d.target.y; });

    // Reposition nodes
    this.svg.selectAll(".node circle")
      .attr("cx", function(d) { return d.x; })
      .attr("cy", function(d) { return d.y; });

    // Reposition labels
    this.svg.selectAll(".node text")
      .attr("x", function(d) { return d.x + 10; })
      .attr("y", function(d) { return d.y; });
  }

  // TODO: Clean this up
  loadData() {
    // API request to list all EC2 instances
    var request = new AWS.EC2().describeInstances({}, (err, resp) => {
      if(err) return console.error(err);

      var roles = {};
      for(var reservation of resp.Reservations) {
        for(var instance of reservation.Instances) {
          // Build a hash of tags (instead of array)
          var tags = {}
          for(var tag of instance.Tags) {
            tags[tag.Key] = tag.Value;
          }

          // Add instance to node data
          if(!roles[tags["Role"]]) {
            roles[tags["Role"]] = {};
            roles[tags["Role"]].name = tags["Role"];
            roles[tags["Role"]].children = [];
          }

          roles[tags["Role"]].children.push({
            instanceId: instance.InstanceId,
            name: tags["Name"],
            role: tags["Role"]
          })
        }
      }

      var data = [];
      var root = {name: "root", children: []}
      data.push(root);
      for(var key in roles) {
        var role = roles[key];
        data.push(role);
        root.children.push(role);

        for(var inst in role.children) {
          data.push(role.children[inst]);
        }
      }

      this.nodes = data;
      this.update();
    });
  }
}
