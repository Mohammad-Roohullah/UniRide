function closeModal() {
  window.history.back();
}

document.getElementById("applyForm").addEventListener("submit", function (e) {
  const fare = parseInt(document.getElementById("fare_offered").value);
  const originalFare = parseInt("<%= postFare %>");

  if (fare < 1) {
    alert("Fare must be at least 1 PKR");
    e.preventDefault();
    return;
  }

  if (fare < originalFare) {
    if (
      !confirm(
        `Your offer (${fare} PKR) is less than the requested fare (${originalFare} PKR). Are you sure?`
      )
    ) {
      e.preventDefault();
      return;
    }
  }

  // Show loading state
  e.target.querySelector('button[type="submit"]').innerHTML =
    '<i class="fas fa-spinner fa-spin"></i> Processing...';
});
