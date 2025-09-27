import React, { useState, useEffect } from "react";
import "../styles/UploadImage.css";

const UploadImage = () => {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [uploads, setUploads] = useState([]);

  // Lấy danh sách file đã upload từ backend
  useEffect(() => {
    const fetchUploads = async () => {
      try {
        const res = await fetch("http://localhost:5000/upload");
        const data = await res.json();
        if (data.success === true || data.success === "true") {
          setUploads(data.data);
        }
      } catch (err) {
        console.error("Fetch uploads error:", err);
      }
    };
    fetchUploads();
  }, []);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    setFile(selectedFile);
    if (selectedFile) {
      setPreview(URL.createObjectURL(selectedFile));
    } else {
      setPreview(null);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) {
      alert("Please choose a file first!");
      return;
    }

    try {
      const formData = new FormData();
      formData.append("file", file); // 👈 key phải là 'file'

      const res = await fetch("http://localhost:5000/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      console.log("📩 Upload API response:", data); // Debug log

      if (data.success === true || data.success === "true") {
        setUploads([data.data, ...uploads]); // thêm file mới vào đầu danh sách
        setFile(null);
        setPreview(null);
        alert(data.message || "✅ Upload successful!");
      } else {
        alert("❌ Upload failed: " + (data.message || "Unknown error"));
      }
    } catch (err) {
      console.error("🔥 Upload error:", err);
      alert("Server error, please try again.");
    }
  };

  // 👉 Hàm View
  const handleView = (url) => {
    window.open(url, "_blank");
  };

  // 👉 Hàm Delete
  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this file?")) return;

    try {
      const res = await fetch(`http://localhost:5000/upload/${id}`, {
        method: "DELETE",
      });
      const data = await res.json();

      if (data.success) {
        setUploads(uploads.filter((u) => u._id !== id));
        alert("✅ File deleted");
      } else {
        alert("❌ Delete failed: " + data.message);
      }
    } catch (err) {
      console.error("Delete error:", err);
      alert("Server error while deleting file");
    }
  };

  return (
    <div className="card upload-card">
      <div className="card-header">
        <h2>Upload Image</h2>
        <button className="btn btn-warning">Show Filters</button>
      </div>

      {/* Upload Form */}
      <div className="card-body">
        <form onSubmit={handleUpload}>
          <div className="form-group">
            <label htmlFor="fileInput">Choose Image</label>
            <input
              type="file"
              id="fileInput"
              className="form-control"
              accept="image/*"
              onChange={handleFileChange}
            />
          </div>

          {preview && (
            <div className="preview-container">
              <p>Preview:</p>
              <img src={preview} alt="Preview" className="preview-img" />
            </div>
          )}

          <button type="submit" className="btn btn-primary mt-3">
            Upload
          </button>
        </form>
      </div>

      {/* Upload History Table */}
      <div className="card-body">
        <h3>Upload History</h3>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>File Name</th>
                <th>Size</th>
                <th>Preview</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {uploads.map((item, index) => (
                <tr key={item._id || item.id}>
                  <td>{index + 1}</td>
                  <td>{item.filename || item.name}</td>
                  <td>
                    {item.size ? (item.size / 1024).toFixed(1) + " KB" : "-"}
                  </td>
                  <td>
                    <img
                      src={item.url}
                      alt={item.filename}
                      className="history-img"
                    />
                  </td>
                  <td className="status-active">success</td>
                  <td>
                    <button
                      className="btn btn-info"
                      onClick={() => handleView(item.url)}
                    >
                      View
                    </button>
                    <button
                      className="btn btn-danger"
                      onClick={() => handleDelete(item._id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {uploads.length === 0 && (
                <tr>
                  <td colSpan="6" style={{ textAlign: "center" }}>
                    No files uploaded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default UploadImage;
