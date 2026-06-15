// Toggle user dropdown menu
function toggleMenu() {
  document.getElementById("userDropdown").classList.toggle("show");
}

// Close dropdown when clicking outside
window.onclick = function (event) {
  if (!event.target.matches(".user-avatar")) {
    const dropdown = document.getElementById("userDropdown");
    if (dropdown.classList.contains("show")) {
      dropdown.classList.remove("show");
    }
  }
};

// Logout function
function logout() {
  window.location.href = "/logout";
}

// Search functionality
document.getElementById("searchInput").addEventListener("input", function (e) {
  const searchTerm = e.target.value.toLowerCase();
  document.querySelectorAll(".post-card").forEach((card) => {
    const text = card.textContent.toLowerCase();
    card.style.display = text.includes(searchTerm) ? "block" : "none";
  });
});

// Apply for ride function
function applyForRide(postId) {
  const currentUserId = "<%= currentUser.id %>";
  const postElement = document.querySelector(`[data-post-id="${postId}"]`);
  const postOwnerId = postElement.getAttribute("data-owner-id");

  if (currentUserId === postOwnerId) {
    alert("You can't apply to your own post");
    return;
  }

  window.location.href = `/apply/${postId}`;
}
