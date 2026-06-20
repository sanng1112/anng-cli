import { DpOrchestrator } from "../src/team/dp/orchestrator";

const prompt = `/team-dp Khởi động Hệ thống Sản xuất Hàng loạt Kịch bản "Vả Mặt" (Face-slapping Drama). Mục tiêu: Chạy thử nghiệm 10 kịch bản độc lập (Data Chunks). Bối cảnh phải cực kỳ đa dạng, xoay quanh xã hội Trung Quốc hiện đại hoặc đô thị (ví dụ: trường học, chốn công sở, cơ quan nhà nước, bệnh viện, giới hào môn...).   
    Khung Cấu Trúc BẮT BUỘC (6 Bước):
    1. The Spark: Phản diện lu loa, đóng vai nạn nhân buộc tội vô lý MC hoặc thâm độc có logic đàng hoàng thậm chí là cao tay. MC lạnh lùng phủ nhận bằng chứng cơ bản.
    2. The Escalation: Đám đông tọc mạch hùa theo tẩy chay MC. MC giữ cái đầu lạnh quan sát.
    3. The Turning Point: Động cơ đen tối/phạm pháp của Phản diện lộ diện. MC bí mật thu thập chứng cứ.
    4. The Trap: MC không đôi co, chỉ mượn tay người thứ ba hoặc ném mồi nhử một cách ngây thơ để gieo rắc sự nghi ngờ vào đám đông.
    5. The Climax: Sự thật bùng nổ. Đám đông quay xe cắn xé Phản diện. MC từ chối cứu rớt một cách thấu tình đạt lý.
    6. The Resolution: Phản diện lãnh nghiệp quật pháp lý/tài chính. MC trở lại bình yên, vị thế nâng cao.
    Nhân vật: MC (Lạnh lùng, lý trí, ít nói), Phản diện (Thao túng tâm lý, hám danh), Đám đông (Ba phải, đạo đức mạng).

    VĂN PHONG BẮT BUỘC: Hành văn mang đậm phong cách mạng Trung Quốc, sử dụng nhiều từ Hán Việt (tỷ như: bạch liên hoa, trà xanh, sảng văn, cẩu huyết, mượn đao giết người...). Cốt truyện phải có sự châm biếm sâu cay, trào phúng thói đạo đức giả của xã hội. 

    Thiết lập Đồ thị (Graph) gồm 4 Agents:
    1. "Chuyên gia Dàn ý" (worker): Nhận chủ đề bối cảnh, thiết lập nhân vật, và viết dàn ý 10 hồi siêu chi tiết dựa theo Khung 6 bước.
    2. "Thẩm định Dàn ý" (tester): Duyệt Dàn ý. Nếu phi logic, thiếu mưu mô, trả về NO để ép Chuyên gia làm lại. Nếu xuất sắc, trả về YES kèm gợi ý để chuyển cho Nhà văn.
    3. "Nhà văn Chi tiết" (worker): Viết full text cho toàn bộ 10 hồi. Yêu cầu viết cực kỳ dài, miêu tả chi tiết từng cái nhếch mép, từng câu thoại châm biếm, độ dài hướng tới tối thiểu 30k chữ.
    4. "Tổng biên tập Kiểm duyệt" (tester): Duyệt bản thảo cuối. Có 2 tiêu chí SỐNG CÒN: (1) Đánh giá xem văn phong có bị sặc "mùi AI" (sáo rỗng, rao giảng đạo lý, rập khuôn) hay không? Phải chân thực và đời thường! (2) Độ dài có đủ quy mô 30k chữ không? Nếu văn có mùi AI hoặc quá ngắn, TRẢ VỀ NO VÀ BẮT BUỘC ĐÁ NGƯỢC LUỒNG về "Chuyên gia Dàn ý" để làm lại từ đầu. Nếu hoàn hảo, trả về YES để chốt Output (Format: [Thứ tự Nhóm] - [Tiêu đề Kịch bản] kèm text).
số luồng đồng thời là 15 luồng`;

async function run() {
  const orchestrator = new DpOrchestrator(process.cwd());
  console.log("Generating proposal...");
  try {
    const proposal = await orchestrator.generateProposal("system", prompt);
    console.log(JSON.stringify(proposal, null, 2));
  } catch (err) {
    console.error("Failed:", err);
  }
}

run();
