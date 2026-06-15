// Handle accepting applicants
document.querySelectorAll(".accept-btn").forEach((btn) => {
  btn.addEventListener("click", function () {
    const card = this.closest(".applicant-card");
    const postId = card.closest(".post-card").dataset.postId;
    const applicantId = card.dataset.applicantId;

    if (confirm("Are you sure you want to accept this applicant?")) {
      fetch(`/accept-applicant/${postId}/${applicantId}`, {
        method: "POST",
      })
        .then((response) => {
          if (response.ok) {
            window.location.reload();
          } else {
            alert("Error accepting applicant");
          }
        })
        .catch((error) => {
          console.error("Error:", error);
          alert("Error accepting applicant");
        });

      // Show loading state
      this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing';
      this.disabled = true;
    }
  });
});

// Handle rejecting applicants
document.querySelectorAll(".reject-btn").forEach((btn) => {
  btn.addEventListener("click", function () {
    const card = this.closest(".applicant-card");
    const postId = card.closest(".post-card").dataset.postId;
    const applicantId = card.dataset.applicantId;

    if (confirm("Are you sure you want to reject this applicant?")) {
      fetch(`/reject-applicant/${postId}/${applicantId}`, {
        method: "POST",
      })
        .then((response) => {
          if (response.ok) {
            window.location.reload();
          } else {
            alert("Error rejecting applicant");
          }
        })
        .catch((error) => {
          console.error("Error:", error);
          alert("Error rejecting applicant");
        });

      // Show loading state
      this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing';
      this.disabled = true;
    }
  });
});

// Handle canceling ride requests
function cancelRequest(postId) {
  if (confirm("Are you sure you want to cancel this ride request?")) {
    fetch(`/cancel-request/${postId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.success) {
          alert("Request cancelled successfully");
          window.location.reload();
        } else {
          alert("Error cancelling request: " + data.message);
        }
      })
      .catch((error) => {
        console.error("Error:", error);
        alert("Error cancelling request");
      });
  }
}
