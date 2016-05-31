class AwsInstanceChart {
    /**
     * Construct an AwsInstanceChart
     * @param el the parent element to populate the chart into
     */
    constructor(el) {
        this.SETTINGS_KEY = "aws-instance-explorer";
        this.DEFAULT_SETTINGS = {
            // AWS credentials
            accessKeyId: null,
            secretAccessKey: null,

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
            groupBy: "instanceType",

            // Instance coloring rules
            colorBy: "instanceType"
        };

        // Settings object (for easy serialization to localStorage)
        this.settings = this.getSettings() || this.DEFAULT_SETTINGS;

        // Instance node data
        this.instances = [];
        this.allTagKeys = new Set();

        // Construct initial node tree
        this.nodes = [];
        this.links = [];
        this.rootNode = {
            id: "root",
            nodeType: "root",
            children: []
        };

        // Create a D3 force-directed graph layout
        this.force = d3.layout.force()
            .nodes(this.nodes)
            .charge(-150)
            .linkDistance(d => {
                return d.source.nodeType == "group" ? 5 : 30;
            })
            .on("tick", () => this.tick());

        // Create the SVG drawing canvas
        this.svg = d3.select(el).append("svg")
            .attr("width", "100%")
            .attr("height", "100%");

        // Create a color palette for nodes
        this.fill = d3.scale.category20();

        // Draw the initial canvas
        this.resize(el);
        this.update();

        // Allow window resizing
        d3.select(window).on("resize", () => this.resize(el));
    }

    /**
     * Set the size of the chart based on the size of the parent element
     * @param el the parent element to populate the chart into
     */
    resize(el) {
        // Save new size
        this.width = el.offsetWidth;
        this.height = el.offsetHeight;

        // Size force-directed graph layout
        this.force.size([this.width, this.height]).resume();
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
        if(d.nodeType == "root") return "#000000";
        if(d.nodeType == "group") return "#ffffff";

        return this.getInstanceColor(d);
    }

    /**
     * Get the stroke color which should be applied to this node
     * @param d the d3 datum
     */
    getNodeStroke(d) {
        if(d.nodeType == "root") return "#555555";
        if(d.nodeType == "group") return "rgba(0, 0, 0, 0.3)";

        return d3.rgb(this.getInstanceColor(d)).darker(0.5);
    }

    /**
     * Get the radius which should be applied to this node
     * @param d the d3 datum
     */
    getNodeRadius(d) {
        if(d.nodeType == "root") return 4;
        if(d.nodeType == "group") return 3;

        let instanceTypes = [
            "nano", "micro", "small", "medium", "large", "xlarge",
            "2xlarge", "4xlarge", "8xlarge", "16xlarge", "32xlarge"
        ];

        return Math.pow(instanceTypes.indexOf(d.instanceType.split(".")[1]), 1.4);
    }

    /**
     * Find a key in a (potentially) nested object
     * @example
     * // returns "db"
     * findKey({tags: {Role: "db"}, instanceType: "r3.large"}, "tags.Role")
     * // returns "r3.large"
     * findKey({tags: {Role: "db"}, instanceType: "r3.large"}, "instanceType")
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
        for(let i = 0; i < rules.length; i++) {
            let [key, expected] = rules[i];
            let actual = this.findKey(key, obj);

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
        for(let i = 0; i < this.settings.filterBy.set.length; i++) {
            if(this.findKey(this.settings.filterBy.set[i], node) === undefined) return false;
        }

        // Apply "notSet" rules
        for(let i = 0; i < this.settings.filterBy.notSet.length; i++) {
            if(this.findKey(this.settings.filterBy.notSet[i], node) !== undefined) return false;
        }

        return true;
    }

    /**
     * Draw nodes after updating the data-set or filtering
     */
    drawNodes() {
        let nodeSelection = this.svg.selectAll(".node").data(this.nodes, d => d.id);

        // Create circle for each AWS instance - add to svg group
        nodeSelection
            .enter().append("circle")
            .attr("class", "node")
            .attr("r", d => this.getNodeRadius(d))
            .on("mouseover", d => { if(this.handleMouseOver) this.handleMouseOver(d); })
            .on("mouseout", d => { if(this.handleMouseOut) this.handleMouseOut(d); })
            .call(this.force.drag);

        // Set/update colors on each circle
        nodeSelection
            .style("fill", d => this.getNodeFill(d))
            .style("stroke", d => this.getNodeStroke(d));

        // Remove orphaned node DOM elements
        nodeSelection
            .exit().remove();
    }

    /**
     * Draw node links after updating the data-set or filtering
     */
    drawLinks() {
        let linkSelection = this.svg.selectAll(".link").data(this.links, (d) => {
            return `${d.source.id}:${d.target.id}`;
        });

        // Create lines for each link
        linkSelection
            .enter().insert("line", ".node")
            .attr("class", "link");

        // Remove orphaned link DOM elements
        linkSelection
            .exit().remove();
    }

    /**
     * Update the node data used to generate the chart
     */
    update() {
        let instances = this.instances.filter(d => this.matchesAllFilters(d));

        // Clear any previous nodes
        this.nodes.length = 0;
        this.rootNode.children.length = 0;
        this.nodes.push(this.rootNode);

        // Check if we should group nodes together
        if(this.settings.groupBy) {
            // Get a unique set of values for this group key
            let groupKeys = new Set();
            instances.forEach(instance => {
                groupKeys.add(this.findKey(this.settings.groupBy, instance));
            });

            // Construct each group node
            groupKeys.forEach(k => {
                let group = {
                    id: k,
                    nodeType: "group",
                    children: []
                };
                this.nodes.push(group);
                this.rootNode.children.push(group);

                // Add all matching instances to this group node
                instances.forEach(instance => {
                    if(this.findKey(this.settings.groupBy, instance) == k) {
                        this.nodes.push(instance);
                        group.children.push(instance);
                    }
                });
            });
        } else {
            // No grouping - just add all instances to root node
            instances.forEach(instance => {
                this.nodes.push(instance);
                this.rootNode.children.push(instance);
            });
        }

        // Create links from the node tree
        this.links = d3.layout.tree().links(this.nodes);

        // Draw nodes and links
        this.drawNodes();
        this.drawLinks();

        // Update force layout
        this.force
            .links(this.links)
            .start();
    }

    /**
     * Update node positions
     */
    tick() {
        // Fix root node to center of view
        this.rootNode.x = this.width / 2;
        this.rootNode.y = this.height / 2;

        // Reposition nodes
        this.svg.selectAll(".node")
            .attr("cx", d => d.x)
            .attr("cy", d => d.y);

        // Reposition links
        this.svg.selectAll(".link")
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);
    }

    /**
     * Load instance data into the chart
     */
    loadInstanceData(callback) {
        // Configure AWS SDK
        AWS.config.region = "us-east-1";
        AWS.config.update({
            accessKeyId: this.settings.accessKeyId,
            secretAccessKey: this.settings.secretAccessKey
        });

        // API request to list all EC2 instances
        new AWS.EC2().describeInstances({}, (err, resp) => {
            if(err) {
                if(callback) callback(err);
                return;
            }

            // Clear any previous instance data
            this.instances.length = 0;

            // Keep track of every tag key we've seen
            this.allTagKeys = new Set();

            // Go through each instance
            for(let reservation of resp.Reservations) {
                for(let instance of reservation.Instances) {
                    // Add instance to internal list
                    this.instances.push({
                        id: instance.InstanceId,
                        nodeType: "instance",
                        instanceId: instance.InstanceId,
                        instanceType: instance.InstanceType,
                        tags: instance.Tags.reduce((obj, tag) => {
                            this.allTagKeys.add(tag.Key);
                            obj[tag.Key] = tag.Value;
                            return obj;
                        }, {})
                    });
                }
            }

            // Update the chart with the new data
            this.update();

            // Let caller know we're done
            if(callback) callback(this.instances);
        });
    }

    /**
     * Save the current settings (including credentials) to local storage
     */
    saveSettings() {
        localStorage.setItem(this.SETTINGS_KEY, JSON.stringify(this.settings));
    }

    /**
     * Fetch saved settings (if any) from local storage
     */
    getSettings() {
        return JSON.parse(localStorage.getItem(this.SETTINGS_KEY));
    }

    /**
     * Get a list of keys for use in colorBy, groupBy, and filterBy operations
     */
    getGroupKeys() {
        return ["instanceId", "instanceType"].concat(Array.from(this.allTagKeys).map(k => `tags.${k}`))
    }

    /**
     * Set and save AWS access key id, reload the chart data
     */
    set accessKeyId(value) {
        if(!value || value == this.settings.accessKeyId) return;

        this.settings.accessKeyId = value;
        this.saveSettings();
        this.loadInstanceData();
    }

    /**
     * Set and save AWS secret access key, reload the chart data
     */
    set secretAccessKey(value) {
        if(!value || value == this.settings.secretAccessKey) return;

        this.settings.secretAccessKey = value;
        this.saveSettings();
        this.loadInstanceData();
    }

    /**
     * Set and save the color key, re-draw the nodes
     */
    set colorBy(value) {
        if(value == this.settings.colorBy) return;

        this.settings.colorBy = value;
        this.saveSettings();
        this.drawNodes();
    }

    /**
     * Set and save the grouping key, update the node tree
     */
    set groupBy(value) {
        if(value == this.settings.groupBy) return;

        this.settings.groupBy = value;
        this.update();
        this.saveSettings();
    }
}
