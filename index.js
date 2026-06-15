const express = require("express");
const bodyParser = require("body-parser");
const session = require("express-session");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 8080;

// Configure app
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.urlencoded({ extended: true }));

// Session setup
app.use(
  session({
    secret: "your-secret-key-123", // Change this to a random string
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false, // Set to true if using HTTPS
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
);

// Data file paths
const USERS_FILE = path.join(__dirname, "users_info.json");
const POSTS_FILE = path.join(__dirname, "posts.json");

// Middlewares
const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.redirect("/");
  }
  next();
};

const getUserData = () => {
  const users = readData(USERS_FILE);
  return {
    find: (id) => users.find((u) => u.uuid === id),
    findIndex: (id) => users.findIndex((u) => u.uuid === id),
    getAll: () => users,
    save: (data) => writeData(USERS_FILE, data),
  };
};

// Helper functions
const readData = (file) => {
  try {
    const data = fs.readFileSync(file, "utf8");
    return JSON.parse(data);
  } catch (err) {
    return []; // Return empty array if file doesn't exist or is empty
  }
};

const writeData = (file, data) => {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
};

function getUserPublicInfo(userId) {
  const users = readData(USERS_FILE);
  const user = users.find((u) => u.uuid === userId);
  return user
    ? {
        name: user.name,
        roll_no: user.roll_no,
        vehicle: user.vehicle,
      }
    : { name: "Unknown User", roll_no: "N/A", vehicle: null };
}

// Post cleanup function
function cleanupExpiredPosts() {
  const posts = readData(POSTS_FILE);
  const users = getUserData().getAll();
  const now = new Date();
  let changed = false;

  const remainingPosts = posts.filter((post) => {
    if (
      post.status === "completed" &&
      post.expires_at &&
      new Date(post.expires_at) <= now
    ) {
      // Clear req_accepted_by for all accepted applicants
      post.applicants.forEach((applicant) => {
        if (applicant.status === "accepted") {
          const userIndex = users.findIndex(
            (u) => u.uuid === applicant.applicant_uuid
          );
          if (userIndex !== -1) {
            users[userIndex].req_accepted_by = null;
            users[userIndex].requested_on_posts = [];
          }
        }
      });

      // Remove post from owner's post_ids
      const ownerIndex = users.findIndex((u) => u.uuid === post.owners_uuid);
      if (ownerIndex !== -1) {
        users[ownerIndex].post_ids = users[ownerIndex].post_ids.filter(
          (id) => id !== post.post_uuid
        );
      }
      changed = true;
      return false; // Remove this post
    }
    return true; // Keep this post
  });

  if (changed) {
    writeData(POSTS_FILE, remainingPosts);
    writeData(USERS_FILE, users);
    console.log("Cleaned up expired posts and reset user ride statuses");
  }
}

// Start the cleanup interval (30 seconds) when server starts
setInterval(cleanupExpiredPosts, 30 * 1000);

///// Routes /////

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

app.get("/", (req, res) => {
  if (req.session.userId) {
    return res.redirect("/home");
  }
  res.render("login_signup");
});

///// Auth Routes /////
app.post("/login", (req, res) => {
  const { uni_id, password } = req.body;
  const users = readData(USERS_FILE);

  const user = users.find(
    (u) =>
      u.uni_id.toLowerCase() === uni_id.toLowerCase() && u.password === password
  );

  if (!user) {
    return res.send(`
      <script>
        alert("Invalid credentials. Please try again.");
        window.location.href = "/";
      </script>
    `);
  }

  req.session.userId = user.uuid;
  res.redirect("/home");
});

app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.log("Error destroying session:", err);
    }
    res.redirect("/");
  });
});

app.post("/register", (req, res) => {
  const { name, roll_no, uni_id, password, phone } = req.body;
  const users = readData(USERS_FILE);

  if (!uni_id.match(/^k\d{6}@nu\.edu\.pk$/i)) {
    return res.send(`
      <script>
        alert("Invalid university email format (kXXXXXX@nu.edu.pk)");
        window.location.href = "/";
      </script>
    `);
  }

  if (
    users.some((user) => user.uni_id.toLowerCase() === uni_id.toLowerCase())
  ) {
    return res.send(`
      <script>
        alert("Email already exists");
        window.location.href = "/";
      </script>
    `);
  }

  if (
    users.some((user) => user.roll_no.toLowerCase() === roll_no.toLowerCase())
  ) {
    return res.send(`
      <script>
        alert("Roll no already exists");
        window.location.href = "/";
      </script>
    `);
  }

  const newUser = {
    uuid: uuidv4(),
    name,
    roll_no,
    uni_id,
    password, // Note: In production, hash this password!
    phone,
    active_post: 0,
    req_accepted_by: null,
    requested_on_posts: [],
    vehicle: null,
    post_ids: [],
  };

  users.push(newUser);
  writeData(USERS_FILE, users);

  // Regenerate session to prevent fixation (Auto login)
  req.session.regenerate((err) => {
    if (err) {
      console.error("Session regeneration error:", err);
      return res.redirect("/");
    }

    req.session.userId = newUser.uuid;
    req.session.save((err) => {
      if (err) {
        console.error("Session save error:", err);
        return res.redirect("/");
      }
      res.redirect("/home");
    });
  });
});

///// Protected Routes /////
app.get("/home", requireAuth, (req, res) => {
  const userData = getUserData();
  const user = userData.find(req.session.userId);
  if (!user) return res.redirect("/");

  const posts = readData(POSTS_FILE);

  res.render("home", {
    currentUser: {
      id: user.uuid,
      name: user.name,
      avatar: user.name.charAt(0).toUpperCase(),
    },
    posts: posts.map((post) => ({
      ...post,
      owner: getUserPublicInfo(post.owners_uuid),
      created_at: new Date(post.created_at).toLocaleString(),
    })),
  });
});

app.get("/dashboard", requireAuth, (req, res) => {
  const userData = getUserData();
  const posts = readData(POSTS_FILE);
  const users = userData.getAll();
  const user = userData.find(req.session.userId);

  if (!user) {
    req.session.destroy();
    return res.redirect("/");
  }

  // Get user's own posts with enhanced applicant info
  const userPosts = posts
    .filter((post) => post.owners_uuid === req.session.userId)
    .map((post) => ({
      ...post,
      applicants: post.applicants.map((applicant) => ({
        ...applicant,
        user_info: getUserPublicInfo(applicant.applicant_uuid),
        status: applicant.status || "pending", // Default status
      })),
    }));

  // Get posts user has applied to
  const requestedPosts = user.requested_on_posts
    .map((postId) => {
      const post = posts.find((p) => p.post_uuid === postId);
      if (!post) return null;

      return {
        ...post,
        owner: getUserPublicInfo(post.owners_uuid),
        user_application: post.applicants.find(
          (a) => a.applicant_uuid === user.uuid
        ),
        status:
          post.applicants.find((a) => a.applicant_uuid === user.uuid)?.status ||
          "pending",
      };
    })
    .filter(Boolean);

  // Get accepted ride if exists
  const acceptedRide = user.req_accepted_by
    ? posts.find((p) => p.post_uuid === user.req_accepted_by)
    : null;

  res.render("dashboard", {
    userInfo: {
      id: user.uuid,
      name: user.name,
      active_post: user.active_post,
    },
    posts: userPosts,
    requestedPosts: requestedPosts,
    acceptedRide: acceptedRide
      ? {
          ...acceptedRide,
          owner: getUserPublicInfo(acceptedRide.owners_uuid),
          applicants: acceptedRide.applicants.map((a) => ({
            ...a,
            user_info: getUserPublicInfo(a.applicant_uuid),
          })),
        }
      : null,
  });
});

app.get("/profile/:name", requireAuth, (req, res) => {
  const users = readData(USERS_FILE);
  const posts = readData(POSTS_FILE);

  // Find the profile being viewed
  const profileUser = users.find((u) => u.name === req.params.name);
  if (!profileUser) {
    return res.status(404).render("error", { message: "User not found" });
  }

  // Find the current logged-in user
  const currentUser = users.find((u) => u.uuid === req.session.userId);

  // Check if this is the user's own profile
  const isOwnProfile = currentUser && currentUser.uuid === profileUser.uuid;

  res.render("profile", {
    user_uuid: req.session.userId,
    name: profileUser.name,
    roll_no: profileUser.roll_no,
    uni_id: profileUser.uni_id,
    vehicle: profileUser.vehicle,
    isOwnProfile: isOwnProfile,
    message: req.query.message
      ? {
          text: req.query.message,
          type: req.query.type || "success",
        }
      : null,
  });
});

//// update vehicle info
app.post("/update-vehicle", requireAuth, (req, res) => {
  const { type, model, color, plate } = req.body;
  const userData = getUserData();
  const users = userData.getAll();
  const userIndex = userData.findIndex(req.session.userId);

  if (userIndex === -1) {
    return res.redirect("/profile");
  }

  users[userIndex].vehicle = {
    type,
    model,
    color,
    ...(plate && { plate }), // Only add plate if provided
  };

  userData.save(users);

  res.redirect(
    `/profile/${users[userIndex].name}?message=Vehicle information updated successfully&type=success`
  );
});

///// remove vehicle info
app.get("/remove-vehicle", requireAuth, (req, res) => {
  const userData = getUserData();
  const users = userData.getAll();
  const userIndex = userData.findIndex(req.session.userId);

  if (userIndex === -1) {
    return res.redirect("/profile");
  }

  users[userIndex].vehicle = null;
  userData.save(users);

  res.redirect(
    `/profile/${users[userIndex].name}?message=Vehicle information removed&type=success`
  );
});

///// post creation /////
// Add this near your other routes
app.get("/create-post", requireAuth, (req, res) => {
  const userData = getUserData();
  const user = userData.find(req.session.userId);

  // Check if user can create a new post

  // Check if user has vehicle info
  if (
    !user.vehicle ||
    !user.vehicle.type ||
    !user.vehicle.model ||
    !user.vehicle.color
  ) {
    return res.send(`
      <script>
        alert("Please fill your vehicle information in your profile first");
        window.location.href = "/profile/${user.name}";
      </script>
    `);
  }

  if (user.active_post >= 2) {
    return res.send(`
      <script>
        alert("You can't create more than 2 active posts");
        window.location.href = "/dashboard";
      </script>
    `);
  }

  if (user.req_accepted_by) {
    return res.send(`
      <script>
        alert("You can't create posts while you have an accepted ride request");
        window.location.href = "/dashboard";
      </script>
    `);
  }

  if (user.requested_on_posts.length > 0) {
    return res.send(`
      <script>
        alert("You can't create posts while you have pending ride requests");
        window.location.href = "/dashboard";
      </script>
    `);
  }

  res.render("create-post", {
    currentUser: {
      id: user.uuid,
      name: user.name,
    },
  });
});

app.post("/create-post", requireAuth, (req, res) => {
  const { route, alternate_route, fare, duration, seats_available } = req.body;
  const userData = getUserData();
  const user = userData.find(req.session.userId);
  const users = userData.getAll();

  // Validate user can create post
  if (user.active_post >= 2) {
    return res.redirect("/dashboard");
  }

  if (user.req_accepted_by) {
    return res.redirect("/dashboard");
  }

  if (user.requested_on_posts.length > 0) {
    return res.redirect("/dashboard");
  }

  // Validate input
  if (!route || !fare || !duration || !seats_available) {
    return res.send(`
      <script>
        alert("Please fill all required fields");
        window.history.back();
      </script>
    `);
  }

  // Create new post
  const newPost = {
    post_uuid: uuidv4(),
    owners_uuid: req.session.userId,
    seats_available: parseInt(seats_available),
    fare: parseInt(fare),
    duration,
    created_at: new Date().toISOString(),
    route,
    alternate_route: alternate_route || null,
    applicants: [],
  };

  // Update posts.json
  const posts = readData(POSTS_FILE);
  posts.push(newPost);
  writeData(POSTS_FILE, posts);

  // Update user's info
  const userIndex = userData.findIndex(req.session.userId);
  if (userIndex !== -1) {
    users[userIndex].active_post += 1;
    users[userIndex].post_ids.push(newPost.post_uuid);
    userData.save(users);
  }

  res.redirect("/dashboard");
});

////// applying and canceling you request on post
app.post("/cancel-request/:postId", requireAuth, (req, res) => {
  const postId = req.params.postId;
  const userData = getUserData();
  const users = userData.getAll();
  const posts = readData(POSTS_FILE);
  const userId = req.session.userId;

  // Find user
  const userIndex = userData.findIndex(userId);
  if (userIndex === -1) {
    return res.status(404).json({ success: false, message: "User not found" });
  }

  // Remove from user's requested_on_posts
  users[userIndex].requested_on_posts = users[
    userIndex
  ].requested_on_posts.filter((id) => id !== postId);

  // Remove from post's applicants
  const postIndex = posts.findIndex((p) => p.post_uuid === postId);
  if (postIndex !== -1) {
    posts[postIndex].applicants = posts[postIndex].applicants.filter(
      (app) => app.applicant_uuid !== userId
    );
  }

  // Save changes
  writeData(POSTS_FILE, posts);
  userData.save(users);

  res.json({ success: true });
});

// GET route to show the application form
app.get("/apply/:postId", requireAuth, (req, res) => {
  const postId = req.params.postId;
  const posts = readData(POSTS_FILE);
  const post = posts.find((p) => p.post_uuid === postId);

  if (!post) {
    return res.redirect("/home");
  }

  const userData = getUserData();
  const user = userData.find(req.session.userId);

  // Check if user can apply

  // Check if user has any active posts
  if (user.active_post > 0) {
    return res.send(`
      <script>
        alert("You cannot apply for rides while you have active posts of your own");
        window.location.href = "/home";
      </script>
    `);
  }

  if (user.req_accepted_by) {
    return res.send(`
      <script>
        alert("You already have an accepted ride request");
        window.location.href = "/home";
      </script>
    `);
  }

  if (user.requested_on_posts.length >= 2) {
    return res.send(`
      <script>
        alert("You can't have more than 2 pending requests");
        window.location.href = "/home";
      </script>
    `);
  }

  if (user.requested_on_posts.includes(postId)) {
    return res.send(`
      <script>
        alert("You've already applied to this ride");
        window.location.href = "/home";
      </script>
    `);
  }

  res.render("apply-form", {
    postId: postId,
    postFare: post.fare,
  });
});

// POST route to handle form submission
app.post("/apply/:postId", requireAuth, (req, res) => {
  const postId = req.params.postId;
  const { fare_offered, pickup_location, notes } = req.body;
  const userId = req.session.userId;

  const userData = getUserData();
  const users = userData.getAll();
  const posts = readData(POSTS_FILE);

  // Validate user can still apply
  const user = userData.find(userId);
  if (user.req_accepted_by || user.requested_on_posts.length >= 2) {
    return res.redirect("/home");
  }

  // Find post
  const postIndex = posts.findIndex((p) => p.post_uuid === postId);
  if (postIndex === -1) {
    return res.redirect("/home");
  }

  // Check if already applied
  if (
    user.requested_on_posts.includes(postId) ||
    posts[postIndex].applicants.some((a) => a.applicant_uuid === userId)
  ) {
    return res.redirect("/home");
  }

  // Create application
  const application = {
    applicant_uuid: userId,
    fare_offered: parseInt(fare_offered),
    pickup_location,
    notes: notes || null,
    status: "pending",
    applied_at: new Date().toISOString(),
  };

  // Update post
  posts[postIndex].applicants.push(application);
  writeData(POSTS_FILE, posts);

  // Update user
  const userIndex = userData.findIndex(userId);
  if (userIndex !== -1) {
    users[userIndex].requested_on_posts.push(postId);
    userData.save(users);
  }

  res.redirect("/dashboard");
});

///// appplication accep/reject

// Accept applicant
app.post("/accept-applicant/:postId/:applicantId", requireAuth, (req, res) => {
  const { postId, applicantId } = req.params;
  const posts = readData(POSTS_FILE);
  const users = getUserData().getAll();

  // Find the post
  const postIndex = posts.findIndex((p) => p.post_uuid === postId);
  if (postIndex === -1) return res.redirect("/dashboard");

  const post = posts[postIndex];

  // Check if seats are available
  if (post.seats_available <= 0) {
    return res.redirect("/dashboard");
  }

  // Find and update the applicant status
  const applicantIndex = post.applicants.findIndex(
    (a) => a.applicant_uuid === applicantId
  );

  if (applicantIndex === -1) return res.redirect("/dashboard");

  // Only proceed if applicant is pending
  if (post.applicants[applicantIndex].status !== "pending") {
    return res.redirect("/dashboard");
  }

  // Accept this applicant
  post.applicants[applicantIndex].status = "accepted";

  // Update applicant's user record
  const userIndex = users.findIndex((u) => u.uuid === applicantId);
  if (userIndex !== -1) {
    // Remove all other applications from ALL posts
    posts.forEach((p) => {
      p.applicants = p.applicants.filter(
        (a) => a.applicant_uuid !== applicantId || p.post_uuid === postId
      );
    });

    // Update user's data
    users[userIndex].req_accepted_by = postId;
    users[userIndex].requested_on_posts = [postId];
  }

  // Reduce available seats
  post.seats_available -= 1;

  // Check if post should be marked as completed (no seats left)
  if (post.seats_available <= 0) {
    // Mark post as completed and set expiration time (10 minutes from now)
    post.status = "completed";
    post.expires_at = new Date(Date.now() + 1 * 60 * 1000).toISOString();

    // Reject all remaining applicants
    post.applicants.forEach((applicant) => {
      if (applicant.status === "pending") {
        applicant.status = "rejected";

        // Update other users' records
        const otherUserIndex = users.findIndex(
          (u) => u.uuid === applicant.applicant_uuid
        );
        if (otherUserIndex !== -1) {
          users[otherUserIndex].requested_on_posts = users[
            otherUserIndex
          ].requested_on_posts.filter((id) => id !== postId);
        }
      }
    });

    // Remove post from owner's active posts count
    const ownerIndex = users.findIndex((u) => u.uuid === post.owners_uuid);
    if (ownerIndex !== -1) {
      users[ownerIndex].active_post -= 1;
    }
  }

  // Save changes
  writeData(POSTS_FILE, posts);
  writeData(USERS_FILE, users);

  res.redirect("/dashboard");
});

// Reject applicant
app.post("/reject-applicant/:postId/:applicantId", requireAuth, (req, res) => {
  const { postId, applicantId } = req.params;
  const posts = readData(POSTS_FILE);
  const users = getUserData().getAll();

  const postIndex = posts.findIndex((p) => p.post_uuid === postId);
  if (postIndex === -1) return res.redirect("/dashboard");

  // Remove the applicant completely from the post
  posts[postIndex].applicants = posts[postIndex].applicants.filter(
    (a) => a.applicant_uuid !== applicantId
  );

  // Update user's requested posts
  const userIndex = users.findIndex((u) => u.uuid === applicantId);
  if (userIndex !== -1) {
    users[userIndex].requested_on_posts = users[
      userIndex
    ].requested_on_posts.filter((id) => id !== postId);
  }

  writeData(POSTS_FILE, posts);
  writeData(USERS_FILE, users);

  res.redirect("/dashboard");
});

//// Update the Cancel Request Route
app.post("/cancel-request/:postId", requireAuth, (req, res) => {
  const postId = req.params.postId;
  const userId = req.session.userId;
  const posts = readData(POSTS_FILE);
  const users = getUserData().getAll();

  // Remove from user's requested posts
  const userIndex = users.findIndex((u) => u.uuid === userId);
  if (userIndex !== -1) {
    users[userIndex].requested_on_posts = users[
      userIndex
    ].requested_on_posts.filter((id) => id !== postId);
  }

  // Remove from post's applicants
  const postIndex = posts.findIndex((p) => p.post_uuid === postId);
  if (postIndex !== -1) {
    posts[postIndex].applicants = posts[postIndex].applicants.filter(
      (a) => a.applicant_uuid !== userId
    );
  }

  writeData(POSTS_FILE, posts);
  writeData(USERS_FILE, users);

  res.json({ success: true });
});
