class AwsInstanceChart {
  /**
   * Construct an AwsInstanceChart
   * @param el the parent element to populate the chart into
   */
  constructor(el) {
    // Configure AWS SDK
    AWS.config.region = 'us-east-1';

    // Create a D3 force-directed graph layout
    this.force = d3.layout.force()
      .charge(-200)
      .on("tick", () => { this.tick() });

    // Create the SVG drawing canvas
    this.svg = d3.select(el).append("svg");

    // Create a color palette for nodes
    this.fill = d3.scale.category20();

    // Set size and allow window resizing
    this.resize(el);
    d3.select(window).on("resize", () => {
      this.resize(el);
    });
  }

  /**
   * Set the size of the chart based on the size of the parent element
   * @param el the parent element to populate the chart into
   */
  resize(el) {
    var width = el.offsetWidth;
    var height = el.offsetHeight;

    // Size SVG canvas
    this.svg
      .attr("width", width)
      .attr("height", height);

    // Size force-directed graph layout
    this.force
      .size([width, height]).resume();
  }

  /**
   * Set which AWS credentials to use to fetch instance data
   * @param accessKeyId your AWS Access Key ID
   * @param secretAccessKey your AWS Secret Access Key
   */
  setCredentials(accessKeyId, secretAccessKey) {
    AWS.config.update({accessKeyId: accessKeyId, secretAccessKey: secretAccessKey});
  }

  /**
   * Get the fill color which should be applied to this node
   * @param d the d3 datum
   */
  getNodeFill(d) {
    return d.children ? "#ffffff" : this.fill(d.role);
  }

  /**
   * Get the stroke color which should be applied to this node
   * @param d the d3 datum
   */
  getNodeStroke(d) {
    return d3.rgb(this.fill(d.role)).darker(2);
  }

  /**
   * Get the radius which should be applied to this node
   * @param d the d3 datum
   */
  getNodeRadius(d) {
    var instanceTypes = [
      "nano", "micro", "small", "medium", "large", "xlarge",
      "2xlarge", "4xlarge", "8xlarge", "16xlarge", "32xlarge"
    ];

    return d.type ? Math.pow(instanceTypes.indexOf(d.type.split(".")[1]), 1.4) : 1;
  }

  /**
   * Update the node data used to generate the chart
   * @param nodes the chart node data
   */
  update(nodes = []) {
    var links = d3.layout.tree().links(nodes);

    // Update nodes and links
    this.force
      .nodes(nodes)
      .links(links)
      .start();

    // Draw nodes
    var node = this.svg.selectAll(".node")
      .data(nodes)
      .enter().append("g")
        .attr("class", "node")
        .call(this.force.drag);

    // Draw circles
    var circle = node.append("circle")
      .attr("r", (d) => { return this.getNodeRadius(d); } )
      .style("fill", (d) => { return this.getNodeFill(d); })
      .style("stroke", (d) => { return this.getNodeStroke(d); });

    // Draw labels
    var label = node.append("text")
      .attr("dy", ".35em")
      .text(function(d) { return d.name; });

    // Draw links
    var link = this.svg.selectAll(".link")
      .data(links)
      .enter().insert("line", ".node")
        .attr("class", "link");

    // Fade in SVG canvas
    this.svg.style("opacity", 1e-6)
      .transition()
        .duration(5000)
        .style("opacity", 1);
  }

  /**
   * Update node positions
   */
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

  /**
   * Fetch a map of instances, grouped by role
   */
  getInstanceMap(cb) {
    // API request to list all EC2 instances
    var request = new AWS.EC2().describeInstances({}, (err, resp) => {
      if(err) return cb(err);

      // Build a map of roles -> instances
      var roles = {};
      for(var reservation of resp.Reservations) {
        for(var instance of reservation.Instances) {
          // Build a hash of tags (instead of ec2's array format)
          var tags = {}
          for(var tag of instance.Tags) {
            tags[tag.Key] = tag.Value;
          }

          // Add instance to role, create role if not seen before
          roles[tags["Role"]] = roles[tags["Role"]] || [];
          roles[tags["Role"]].push({
            instanceId: instance.InstanceId,
            type: instance.InstanceType,
            name: tags["Name"],
            role: tags["Role"]
          });
        }
      }

      // Return instance map
      cb(null, roles);
    });
  }

  /**
   * Load instance data into the chart
   */
  loadData() {
    this.getInstanceMap((err, instanceMap) => {
      // Build a flattened tree of nodes from the hash, for d3
      var nodes = [];
      var rootNode = {name: "root", children: []};
      nodes.push(rootNode);

      // Add each role to the tree
      for(var role in instanceMap) {
        var roleNode = {name: role, children: []};
        nodes.push(roleNode);
        rootNode.children.push(roleNode);

        // Add each instance to the tree
        instanceMap[role].forEach((instanceNode) => {
          nodes.push(instanceNode);
          roleNode.children.push(instanceNode);
        });
      }

      // Update the chart with the new data
      this.update(nodes);
    });
  }
}
