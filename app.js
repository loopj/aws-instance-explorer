class AwsInstanceChart {
  /**
   * Construct an AwsInstanceChart
   * @param el the parent element to populate the chart into
   */
  constructor(el) {
    // Settings object (for easy serialization to localStorage)
    this.settings = {
      // Instance filtering rules
      filterBy: {
        equals: [],
        notEquals: [],
        contains: [],
        notContains: [],
        set: [],
        notSet: []
      },

      // Instance grouping rules
      groupBy: [],

      // Instance coloring rules
      colorBy: null
    };

    // Instance node data
    this.instances = [];
    this.rootNode = {name: "root", group: true};

    // Configure AWS SDK
    AWS.config.region = 'us-east-1';

    // Create a D3 force-directed graph layout
    this.force = d3.layout.force()
      .charge(-200)
      .on("tick", () => this.tick());

    // Create the SVG drawing canvas
    this.svg = d3.select(el).append("svg");

    // Create a color palette for nodes
    this.fill = d3.scale.category20();

    // Set size and allow window resizing
    this.resize(el);
    d3.select(window).on("resize", () => this.resize(el));
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
    this.settings.accessKeyId = accessKeyId;
    this.settings.secretAccessKey = secretAccessKey;

    AWS.config.update({accessKeyId: accessKeyId, secretAccessKey: secretAccessKey});
  }

  /**
   * Get the node color which should be applied to this instance node
   * @param d the d3 datum
   */
  getInstanceColor(d) {
    return this.fill(this.findKey(this.settings.colorBy, d));
  }

  /**
   * Get the fill color which should be applied to this node
   * @param d the d3 datum
   */
  getNodeFill(d) {
    return d.group ? "#ffffff" : this.getInstanceColor(d);
  }

  /**
   * Get the stroke color which should be applied to this node
   * @param d the d3 datum
   */
  getNodeStroke(d) {
    return d.group ? "#555555" : d3.rgb(this.getInstanceColor(d)).darker(0.5);
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

    return d.group ? 3 : Math.pow(instanceTypes.indexOf(d.type.split(".")[1]), 1.4);
  }

  /**
   * Find a key in a (potentially) nested object
   * @example
   * // returns "db"
   * findKey({tags: {Role: "db"}, type: "r3.large"}, "tags.Role")
   * // returns "r3.large"
   * findKey({tags: {Role: "db"}, type: "r3.large"}, "type")
   */
  findKey(key, obj) {
    try {
      return key.split(".").reduce((o, i) => o[i], obj);
    } catch (e) {
      return undefined;
    }
  }

  /**
   * Given a set of filter rules, check if they all match using the given test function
   */
  matchesFilter(rules, obj, testFunc) {
    for(var i = 0; i < rules.length; i++) {
      var [key, expected] = rules[i];
      var actual = this.findKey(key, obj);

      if(!testFunc(actual, expected)) return false;
    }

    return true;
  }

  /**
   * Check if the given node matches all active filters
   */
  matchesAllFilters(node) {
    // Apply "equals" rules
    if(!this.matchesFilter(this.settings.filterBy.equals, node, (a, b) => a == b)) {
      return false;
    }

    // Apply "notEquals" rules
    if(!this.matchesFilter(this.settings.filterBy.notEquals, node, (a, b) => a != b)) {
      return false;
    }

    // Apply "contains" rules
    if(!this.matchesFilter(this.settings.filterBy.contains, node, (a, b) => !!a.match(new RegExp(b)))) {
      return false;
    }

    // Apply "notContains" rules
    if(!this.matchesFilter(this.settings.filterBy.notContains, node, (a, b) => !a.match(new RegExp(b)))) {
      return false;
    }

    // Apply "set" rules
    for(var i = 0; i < this.settings.filterBy.set.length; i++) {
      if(this.findKey(this.settings.filterBy.set[i], node) === undefined) return false;
    }

    // Apply "notSet" rules
    for(var i = 0; i < this.settings.filterBy.notSet.length; i++) {
      if(this.findKey(this.settings.filterBy.notSet[i], node) !== undefined) return false;
    }

    return true;
  }

  drawNodes(nodes) {
    var nodeSelection = this.svg.selectAll(".node").data(nodes, (d) => {
      return `${d.instanceId}`;
    });

    // Create svg group element for each instance
    var nodeGroup = nodeSelection
      .enter().append("g")
        .attr("class", "node")
        .call(this.force.drag);

    // Create circle for each AWS instance - add to svg group
    nodeGroup.append("circle")
      .attr("r", d => this.getNodeRadius(d))
      .style("fill", d => this.getNodeFill(d))
      .style("stroke", d => this.getNodeStroke(d));

    // Create label for each AWS instance - add to svg group
    nodeGroup.append("text")
      .attr("dy", ".35em")
      .text(d => d.tags ? d.tags.Name : d.name);

    // Remove orphaned node DOM elements
    nodeSelection.exit().remove();
  }

  drawLinks(links) {
    var linkSelection = this.svg.selectAll(".link").data(links, (d) => {
      return `${d.source.instanceId}-${d.target.instanceId}`;
    });

    // Create lines for each link
    linkSelection
      .enter().insert("line", ".node")
        .attr("class", "link");

    // Remove orphaned link DOM elements
    linkSelection.exit().remove();
  }

  /**
   * Update the node data used to generate the chart
   */
  update() {
    // TODO: Build grouping hierachy here
    // - build nodes from filtered instance list, with children objects
    // - use d3.layout.tree to get tree.links(nodes)
    var nodes = this.instances.filter(d => this.matchesAllFilters(d));
    nodes.push(this.rootNode);

    var links = nodes.map(d => ({source: this.rootNode, target: d}));

    // Draw nodes and links
    this.drawNodes(nodes);
    this.drawLinks(links);

    // Update force layout
    this.force
      .nodes(nodes)
      .links(links)
      .start();
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
   * Load instance data into the chart
   */
  loadInstanceData() {
    // API request to list all EC2 instances
    new AWS.EC2().describeInstances({}, (err, resp) => {
      if(err) return;

      // Build a map of roles -> instances
      for(var reservation of resp.Reservations) {
        for(var instance of reservation.Instances) {
          // Build a hash of tags (instead of ec2's array format)
          var tags = {}
          for(var tag of instance.Tags) {
            tags[tag.Key] = tag.Value;
          }

          // Add instance to nodes list
          this.instances.push({
            instanceId: instance.InstanceId,
            type: instance.InstanceType,
            tags: tags
          });
        }
      }

      // Update the chart with the new data
      this.update();
    });
  }
}
