using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// 掛在一個空的 GameManager GameObject 上，全場景只需要一個。
/// 用簡單的 static Instance 讓其他腳本（如 CoinPickup）可以直接存取。
/// </summary>
public class GameManager : MonoBehaviour
{
    public static GameManager Instance { get; private set; }

    [SerializeField] private Text scoreText;

    private int score;

    private void Awake()
    {
        if (Instance != null && Instance != this)
        {
            Destroy(gameObject);
            return;
        }

        Instance = this;
    }

    private void Start()
    {
        UpdateScoreDisplay();
    }

    public void AddScore(int amount)
    {
        score += amount;
        UpdateScoreDisplay();
    }

    private void UpdateScoreDisplay()
    {
        Debug.Log($"Score: {score}");

        if (scoreText != null)
        {
            scoreText.text = $"Score: {score}";
        }
    }
}
